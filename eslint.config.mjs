import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

const banSourceCommentsPlugin = {
  rules: {
    'no-comments': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow comments in source code files',
        },
        schema: [],
        messages: {
          noComments: 'Comments are not allowed in source files.',
        },
      },
      create(context) {
        return {
          Program() {
            const comments = context.sourceCode.getAllComments();
            for (const comment of comments) {
              context.report({
                loc: comment.loc,
                messageId: 'noComments',
              });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'prompt/**', '*.config.*', '*rc'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Inline styles are forbidden. Use Tailwind CSS classes instead.',
        },
      ],
    },
  },
  {
    files: ['apps/server/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['load-tests/**/*.{js,ts}'],
    plugins: {
      'custom-rules': banSourceCommentsPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        __VU: 'readonly',
        __ENV: 'readonly',
        __ITER: 'readonly',
      },
    },
    rules: {
      'no-inline-comments': 'error',
      'custom-rules/no-comments': 'error',
    },
  },
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    plugins: {
      'custom-rules': banSourceCommentsPlugin,
    },
    rules: {
      'no-inline-comments': 'error',
      'custom-rules/no-comments': 'error',
    },
  },
);
