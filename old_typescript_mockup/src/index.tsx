import React from 'react';
import ReactDOM from "react-dom/client";

import App from './App';
import { PollDataProvider } from './contexts/PollDataContext';


const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <PollDataProvider>
      <App />
    </PollDataProvider>,
  </React.StrictMode>
);
