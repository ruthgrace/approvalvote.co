import React, { createContext, useState, ReactNode, FC } from 'react';

interface PollDataType {
  candidates: string;
  seats: number;
  setCandidates: (candidates: string) => void;
  setSeats: (seats: number) => void;
}

const PollDataContext = createContext<PollDataType | undefined>(undefined);

interface ProviderProps {
  children: ReactNode;
}

const PollDataProvider: FC<ProviderProps> = ({ children }) => {
  const [candidates, setCandidates] = useState<string>('');
  const [seats, setSeats] = useState<number>(0);

  return (
    <PollDataContext.Provider value={{ candidates, seats, setCandidates, setSeats }}>
      {children}
    </PollDataContext.Provider>
  );
};

export { PollDataContext, PollDataProvider };