import React, { useState, useContext } from 'react';
import { PollDataContext } from '../contexts/PollDataContext';


const PollResult: React.FC = () => {
  const context = useContext(PollDataContext);

  if (!context) {
    throw new Error('PollResults must be used within a PollDataProvider');
  }
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [voteDifferenceString, setVoteDifferenceString] = useState<string>('');

  const { candidates, seats, setCandidates, setSeats } = context;
  const candidateList: string[] = candidates.split('\n');
  const winners: string[] = candidateList.slice(0, seats)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSelectedOptions(prevState => {
      const updatedOptions = prevState.includes(value)
        ? prevState.filter(candidate => candidate !== value)  // Remove if already selected
        : [...prevState, value];  // Add if not selected

      // Update voteDifferenceString based on updatedOptions
      setVoteDifferenceString(updatedOptions.length === 0
        ? ''
        : 'Candidate ' + updatedOptions[0] + ' was 3 votes behind the current winner.');

      return updatedOptions;
    });
  };

  return (
    <main>
      <h1>Poll results!</h1>
      <p>Winners: {winners.join(', ')}</p>
      <hr />
      <p>Did you have a different preferred result?</p>
      <p>You can see how many more votes the winners got than your preferred result. What was your preferred result?</p>
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
      <p>{voteDifferenceString}</p>
    </main >
  );
};

export default PollResult;