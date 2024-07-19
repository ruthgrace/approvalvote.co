import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const MakePoll: React.FC = () => {
  const [candidates, setCandidates] = useState('');
  const [seats, setSeats] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    console.log('Candidates:', candidates);
    console.log('Number of seats:', seats);
    // You can add further processing here, like sending the data to a server
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
            cols="50">
          </textarea>
        </div>
        <div>
          <label htmlFor="seats">Number of seats:</label>
          <input
            type="number"
            id="seats"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </div>
        <button type="submit">Create Poll</button>
      </form>
    </div>
  );
};

export default MakePoll;