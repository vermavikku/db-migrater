import React from 'react';
import {RouterProvider} from 'react-router-dom';
import {Toaster} from 'react-hot-toast';
import {router} from './router.jsx';
export function App(){return <><RouterProvider router={router}/><Toaster position="bottom-right" toastOptions={{duration:4500}}/></>;}
