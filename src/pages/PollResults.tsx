import React from 'react';
import { useLocation } from 'react-router-dom';


const Poll: React.FC = () => {
  const location = useLocation();
  const pollData = location.state as { pollData: PollData };

  if (!pollData) {
    return <div>No poll information available.</div>;
  }

  return (
    <main>
      <h1>Vote!</h1>
      Select all candidates that you approve of:
      <div>
        <p>{pollData.pollData.candidates}</p>
        <p>{pollData.pollData.seats}</p>

        <button>Submit Vote</button>
      </div>
    </main >
  );
};

export default Poll;