import React from 'react';

import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './components/Home/home';
import Navbar from './components/Navbar/Navbar';
import Auth from './components/Auth/Auth';
import './styleapp.css';

const App = () => (
  <BrowserRouter>
    
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
      </Routes>
      
    
  </BrowserRouter>
);

export default App;