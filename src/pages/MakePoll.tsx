import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import { PollDataContext } from '../contexts/PollDataContext';

const MakePoll: React.FC = () => {
  const context = useContext(PollDataContext);

  if (!context) {
    throw new Error('MakePoll must be used within a PollDataProvider');
  }

  const { candidates, seats, setCandidates, setSeats } = context;
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Navigate to VotingPage with poll data
    navigate('/vote');
  };

  return (
    <div>
      <h1>Make a Poll</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="candidates">Candidates:</label>
          <textarea
            id="candidates"
            value={candidates}
            onChange={(e) => setCandidates(e.target.value)}
            cols={50} />
        </div>
        <div>
          <label htmlFor="seats">Number of seats:</label>
          <input
            type="number"
            id="seats"
            value={seats}
            onChange={(e) => setSeats(e.target.valueAsNumber)}
          />
        </div>
        <button type="submit">Create Poll</button>
      </form>
    </div>
  );
};

export default MakePoll;