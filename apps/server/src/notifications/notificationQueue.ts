import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { sendTelegramMessage, type InlineKeyboardButton } from '../telegram/telegramService.js';

export interface TelegramNotificationJobData {
  chatId: number | string;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  webAppUrl?: string;
  inlineKeyboard?: InlineKeyboardButton[][];
  parseMode?: 'HTML' | 'MarkdownV2';
  botToken?: string;
  apiBaseUrl?: string;
}

export interface NotificationQueueOptions {
  redisUrl?: string;
  attempts?: number;
  backoffDelayMs?: number;
}

interface InMemoryJob {
  id: string;
  data: TelegramNotificationJobData;
  attemptsMade: number;
  maxAttempts: number;
  backoffDelayMs: number;
}

let bullQueue: Queue<TelegramNotificationJobData> | null = null;
let bullWorker: Worker<TelegramNotificationJobData> | null = null;
let redisClient: Redis | null = null;
let redisWorkerClient: Redis | null = null;

let isMemoryMode = false;
let inMemoryQueue: InMemoryJob[] = [];
let inMemoryActiveCount = 0;
let inMemoryDrainedResolvers: Array<() => void> = [];
let inMemoryAttempts = 3;
let inMemoryBackoffDelayMs = 1000;
let inMemoryClosed = false;
const inMemoryTimers: Set<NodeJS.Timeout> = new Set();
let jobCounter = 0;

function notifyDrainIfIdle(): void {
  if (inMemoryQueue.length === 0 && inMemoryActiveCount === 0 && inMemoryTimers.size === 0) {
    const resolvers = inMemoryDrainedResolvers;
    inMemoryDrainedResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }
}

async function processInMemoryJob(job: InMemoryJob): Promise<void> {
  if (inMemoryClosed) {
    return;
  }
  inMemoryActiveCount++;
  try {
    const success = await sendTelegramMessage(job.data);
    if (!success) {
      throw new Error(`Failed to deliver Telegram notification to ${job.data.chatId}`);
    }
  } catch (error) {
    job.attemptsMade++;
    const message = error instanceof Error ? error.message : String(error);
    if (job.attemptsMade >= job.maxAttempts) {
      process.stderr.write(
        `Warning: Telegram notification job failed permanently for ${job.data.chatId} after ${job.attemptsMade} attempts: ${message}\n`,
      );
    } else {
      const delay = job.backoffDelayMs * Math.pow(2, job.attemptsMade - 1);
      const timer = setTimeout(() => {
        inMemoryTimers.delete(timer);
        if (!inMemoryClosed) {
          void processInMemoryJob(job);
        }
      }, delay);
      inMemoryTimers.add(timer);
    }
  } finally {
    inMemoryActiveCount--;
    notifyDrainIfIdle();
  }
}

function processNextInMemory(): void {
  if (inMemoryClosed || inMemoryQueue.length === 0) {
    notifyDrainIfIdle();
    return;
  }
  const next = inMemoryQueue.shift();
  if (next) {
    void processInMemoryJob(next);
  }
}

export async function initNotificationQueue(
  options?: NotificationQueueOptions,
): Promise<void> {
  await closeNotificationQueue();

  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL ?? 'memory';
  const attempts = options?.attempts ?? 3;
  const backoffDelayMs = options?.backoffDelayMs ?? 1000;

  if (redisUrl === 'memory') {
    isMemoryMode = true;
    inMemoryQueue = [];
    inMemoryActiveCount = 0;
    inMemoryDrainedResolvers = [];
    inMemoryAttempts = attempts;
    inMemoryBackoffDelayMs = backoffDelayMs;
    inMemoryClosed = false;
    inMemoryTimers.clear();
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null,
      connectTimeout: 5000,
    });
    redisClient.on('error', () => {});
    await redisClient.connect();

    redisWorkerClient = redisClient.duplicate({ maxRetriesPerRequest: null });
    redisWorkerClient.on('error', () => {});
    await redisWorkerClient.connect();

    bullQueue = new Queue<TelegramNotificationJobData>('telegram-notifications', {
      connection: redisClient,
      defaultJobOptions: {
        attempts,
        backoff: {
          type: 'exponential',
          delay: backoffDelayMs,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });

    bullWorker = new Worker<TelegramNotificationJobData>(
      'telegram-notifications',
      async (job: Job<TelegramNotificationJobData>) => {
        const success = await sendTelegramMessage(job.data);
        if (!success) {
          throw new Error(`Failed to deliver Telegram notification to ${job.data.chatId}`);
        }
      },
      {
        connection: redisWorkerClient,
      },
    );

    bullWorker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        process.stderr.write(
          `Warning: Telegram notification job failed permanently for ${job.data.chatId} after ${job.attemptsMade} attempts: ${error.message}\n`,
        );
      }
    });

    isMemoryMode = false;
  } catch {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {
        void 0;
      }
      redisClient = null;
    }
    if (redisWorkerClient) {
      try {
        redisWorkerClient.disconnect();
      } catch {
        void 0;
      }
      redisWorkerClient = null;
    }

    isMemoryMode = true;
    inMemoryQueue = [];
    inMemoryActiveCount = 0;
    inMemoryDrainedResolvers = [];
    inMemoryAttempts = attempts;
    inMemoryBackoffDelayMs = backoffDelayMs;
    inMemoryClosed = false;
    inMemoryTimers.clear();
  }
}

export async function enqueueTelegramNotification(
  data: TelegramNotificationJobData,
): Promise<{ id: string }> {
  if (!bullQueue && !isMemoryMode) {
    await initNotificationQueue();
  }

  jobCounter++;
  const id = `job_${Date.now()}_${jobCounter}`;

  if (isMemoryMode || !bullQueue) {
    const job: InMemoryJob = {
      id,
      data,
      attemptsMade: 0,
      maxAttempts: inMemoryAttempts,
      backoffDelayMs: inMemoryBackoffDelayMs,
    };
    inMemoryQueue.push(job);
    queueMicrotask(() => {
      processNextInMemory();
    });
    return { id };
  }

  const job = await bullQueue.add('send-telegram-message', data);
  return { id: String(job.id ?? id) };
}

export async function drainNotificationQueue(): Promise<void> {
  if (isMemoryMode) {
    if (inMemoryQueue.length === 0 && inMemoryActiveCount === 0 && inMemoryTimers.size === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      inMemoryDrainedResolvers.push(resolve);
    });
    return;
  }

  if (bullQueue) {
    await bullQueue.drain();
  }
}

export async function closeNotificationQueue(): Promise<void> {
  if (isMemoryMode) {
    inMemoryClosed = true;
    for (const timer of inMemoryTimers) {
      clearTimeout(timer);
    }
    inMemoryTimers.clear();
    inMemoryQueue = [];
    inMemoryActiveCount = 0;
    const resolvers = inMemoryDrainedResolvers;
    inMemoryDrainedResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  if (bullWorker) {
    try {
      await bullWorker.close();
    } catch {
      void 0;
    }
    bullWorker = null;
  }

  if (bullQueue) {
    try {
      await bullQueue.close();
    } catch {
      void 0;
    }
    bullQueue = null;
  }

  if (redisWorkerClient) {
    try {
      redisWorkerClient.disconnect();
    } catch {
      void 0;
    }
    redisWorkerClient = null;
  }

  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
      void 0;
    }
    redisClient = null;
  }
}
