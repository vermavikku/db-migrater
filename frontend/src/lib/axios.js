import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000',timeout:30000,headers:{'Content-Type':'application/json'}});
export function apiMessage(error) {
  if(error?.response?.data?.error?.message) return error.response.data.error.message;
  if(error?.code==='ERR_NETWORK') return `Cannot reach the backend at ${api.defaults.baseURL}. Check VITE_API_URL in frontend/.env, PORT in backend/.env, and FRONTEND_ORIGIN in backend/.env, then restart both servers.`;
  return 'The request could not be completed. Check that the backend is running.';
}
