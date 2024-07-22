import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { PollDataContext } from '../contexts/PollDataContext';

const Poll: React.FC = () => {
  const context = useContext(PollDataContext);

  if (!context) {
    throw new Error('Poll must be used within a PollDataProvider');
  }
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const navigate = useNavigate();

  // Handle button click
  const handleSubmit = () => {
    navigate('/results'); // Navigate to the results page
  };

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
      Select all options that you approve of:
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
        <p>There will be {seats} options selected after the poll closes.</p>

        <button type="button" onClick={handleSubmit}>Submit Vote</button>
      </div>
    </main >
  );
};

export default Poll;