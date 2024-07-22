import React, { useState, useContext } from 'react';
import { PollDataContext } from '../contexts/PollDataContext';

const Poll: React.FC = () => {
  const context = useContext(PollDataContext);

  if (!context) {
    throw new Error('Poll must be used within a PollDataProvider');
  }
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSelectedOptions(prevState =>
      prevState.includes(value)
        ? prevState.filter(candidate => candidate !== value)  // Remove if already selected
        : [...prevState, value]  // Add if not selected
    );
  };

  const { candidates, seats, setCandidates, setSeats } = context;
  const candidateList: string[] = candidates.split('\n');
  return (
    <main>
      <h1>Vote!</h1>
      Select all candidates that you approve of:
      <div>
        {candidateList.map((candidate, index) => (
          <div key={index}>
            <label>
              <input
                type="checkbox"
                value={candidate}
                checked={selectedOptions.includes(candidate)}
                onChange={handleChange}
              />
              {candidate}
            </label>
          </div>
        ))}
        <p>There will be {seats} candidates elected.</p>

        <a href="/results">
          <button type="button">Submit Vote</button>
        </a>
      </div>
    </main >
  );
};

export default Poll;