import './App.css'
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import MakePoll from './pages/MakePoll';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route exact path="/" element={<Home />} />
        <Route path="/makepoll" element={<MakePoll />} />
      </Routes>
    </Router>
  );
};

export default App;
