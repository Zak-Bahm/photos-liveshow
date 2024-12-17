import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './components/Login.js';
import AlbumSelect from './components/AlbumSelect.js';
import AlbumShow from './components/AlbumShow.js';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/albums" element={<AlbumSelect />} />
      <Route path="/albums/:albumId" element={<AlbumShow />} />
    </Routes>
  );
};

export default App;
