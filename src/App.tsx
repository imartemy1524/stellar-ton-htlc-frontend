import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Container, Navbar, Nav } from 'react-bootstrap';
import './App.css';

import HomePage from './components/pages/HomePage';
import CreateOfferPage from './components/pages/CreateOfferPage';
import OfferListPage from './components/pages/OfferListPage';
import OfferDetailsPage from './components/pages/OfferDetailsPage';

function App() {
  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand as={Link} to="/">HTLC Swap</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/">Home</Nav.Link>
              <Nav.Link as={Link} to="/create-offer">Create Offer</Nav.Link>
              <Nav.Link as={Link} to="/offers">View Offers</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* Routes will render their components here */}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create-offer" element={<CreateOfferPage />} />
        <Route path="/offers" element={<OfferListPage />} />
        <Route path="/offer/:id" element={<OfferDetailsPage />} />
      </Routes>
    </>
  );
}

export default App;
