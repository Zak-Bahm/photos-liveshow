import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AlbumSelect = () => {
  const [albums, setAlbums] = useState([]);
  const navigate = useNavigate();

  useEffect(async () => {
    const response = await fetch('/api/albums');
    if (!response.ok) throw new Error('Failed to fetch albums');

    const data = await response.json();
    setAlbums(data);
  }, []);

  return (
    <div className="container mt-5">
      <div className="card p-4">
        <h2>Select an Album</h2>
        <ul className="list-group">
          {albums.map((album) => (
            <a
              href={`/albums/${album.id}`}
              className="list-group-item list-group-item-action"
              key={album.id}
              onClick={() => navigate(`/albums/${album.id}`)}
            >
              {album.title}
            </a>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AlbumSelect;
