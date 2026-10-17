import js from '@eslint/js';
import globals from 'globals';
export default [js.configs.recommended, {files:['**/*.js'], languageOptions:{globals:{...globals.node,...globals.vitest}}, rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}]}}];
