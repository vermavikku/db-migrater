import process from 'node:process';
import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  const port=Number(env.VITE_PORT || 5173);
  return {plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',port,strictPort:true}};
});
