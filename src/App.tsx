import './App.css'
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import MakePoll from './pages/MakePoll';
import Poll from './pages/Poll';
import PollResults from './pages/PollResults';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route exact path="/" element={<Home />} />
        <Route path="/makepoll" element={<MakePoll />} />
        <Route path="/vote" element={<Poll />} />
        <Route path="/results" element={<PollResults />} />
      </Routes>
    </Router>
  );
};

export default App;
