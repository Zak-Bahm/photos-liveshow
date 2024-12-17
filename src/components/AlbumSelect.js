import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const AlbumSelect = () => {
  const [albums, setAlbums] = useState([]);

  useEffect(async () => {
    const response = await axios.get('/api/albums');
    setAlbums(response.data);
  }, []);

  return (
    <div className="container mt-5">
      <div className="card p-4">
        <h2>Select an Album</h2>
        <ul className="list-group">
          {albums.map((album) => (
            <Link
              to={`/albums/${album.id}`}
              className="list-group-item list-group-item-action"
              key={album.id}
            >
              {album.title}
            </Link>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AlbumSelect;
