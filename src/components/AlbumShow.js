import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const AlbumShow = () => {
  const { albumId } = useParams();
  const [images, setImages] = useState([]);
  const [currentImage, setCurrentImage] = useState(null);
  const [imageCache, setImageCache] = useState(new Set());
  const [latestId, setLatestId] = useState(null);
  const [nextPage, setNextPage] = useState(null);

  // Initial fetch and polling setup
  useEffect(() => {
    const fetchImages = async () => {
      try {
        const params = new URLSearchParams();
        if (nextPage) params.append('nextPage', nextPage);
        if (latestId) params.append('latestId', latestId);
        const url = `/api/albums/${albumId}${params.toString() ? `?${params.toString()}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch images');
        
        const data = await response.json();
        const mediaItems = data.mediaItems || [];

        // Update latestId with first mediaItem if this is first page
        if (!nextPage && mediaItems.length > 0) {
          setLatestId(mediaItems[0].id);
        }

        // Set next page token or false if none
        setNextPage(data.nextPageToken || false);

        // Process media items
        const imageList = mediaItems.map((media) => ({
          id: media.id,
          url: `${media.baseUrl}=w${media.mediaMetadata.width}-h${media.mediaMetadata.height}`,
          creationTime: new Date(media.mediaMetadata.creationTime),
        }));

        setImages(prev => [...prev, ...imageList]);

        // Preload first image if this is first page
        if (!nextPage && imageList.length > 0) {
          preloadImage(imageList[0].url);
          setCurrentImage(imageList[0].url);
        }

        // Preload remaining images
        imageList.forEach((img) => preloadImage(img.url));

      } catch (error) {
        console.error("Error fetching images:", error);
      }
    };

    // Initial fetch
    fetchImages();

    // Set up polling interval
    const pollInterval = setInterval(fetchImages, 30000);

    // Cleanup
    return () => clearInterval(pollInterval);
  }, [albumId, latestId]);

  // Preload an image and cache it
  const preloadImage = (url) => {
    if (!imageCache.has(url)) {
      const img = new Image();
      img.src = url;
      setImageCache((prev) => new Set(prev).add(url));
    }
  };

  // Random image selector
  useEffect(() => {
    if (images.length > 0) {
      const interval = setInterval(() => {
        const randomImage =
          images[Math.floor(Math.random() * images.length)].url;
        setCurrentImage(randomImage);
      }, 3000); // Change image every 3 seconds

      return () => clearInterval(interval); // Cleanup on unmount
    }
  }, [images]);

  return (
    <div className="container-fluid p-0">
      <div
        className="d-flex align-items-center justify-content-center vh-100 bg-dark"
        style={{ overflow: "hidden" }}
      >
        {currentImage ? (
          <img
            src={currentImage}
            alt="Slideshow"
            className="img-fluid"
            style={{ maxHeight: "100vh", maxWidth: "100%" }}
          />
        ) : (
          <div className="text-white">Loading images...</div>
        )}
      </div>
    </div>
  );
};

export default AlbumShow;
