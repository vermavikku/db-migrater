import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
export default [{ignores:['dist/**']},js.configs.recommended, {files:['**/*.{js,jsx}'],languageOptions:{globals:{...globals.browser,...globals.vitest},parserOptions:{ecmaFeatures:{jsx:true}}},plugins:{'react-hooks':reactHooks},rules:{...reactHooks.configs.recommended.rules,'no-unused-vars':['error',{varsIgnorePattern:'^[A-Z_]',argsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}]}}];
