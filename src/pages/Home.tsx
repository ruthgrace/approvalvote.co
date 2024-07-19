import React from 'react'

const Home: React.FC = () => {
  return (
    <main>
      <h1>Optimize group decisions.</h1>
      You can't please everyone, but with approval voting you can get close!

      <a href="/makepoll">
        <button type="button">Make a poll</button>
      </a>

    </main >
  );
};

export default Home;