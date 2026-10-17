import React from 'react';
import {createBrowserRouter} from 'react-router-dom';
import {MigrationPage} from '../modules/migrations/pages/MigrationPage.jsx';
export const router=createBrowserRouter([{path:'/',element:<MigrationPage/>},{path:'*',element:<div className="grid min-h-screen place-items-center bg-canvas text-ink"><a className="text-brand underline" href="/">Return to DB Migrater</a></div>}]);
