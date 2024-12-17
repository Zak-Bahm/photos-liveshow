import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

function getRandomIndex(arrayLength) {
    if (arrayLength <= 0) return -1; // Handle invalid input

    const firstSegmentEnd = Math.floor(arrayLength / 6); // End of 1/6
    const secondSegmentEnd = Math.floor(arrayLength / 6 + arrayLength / 3); // End of 1/6 + 1/3
    const thirdSegmentEnd = arrayLength; // Remaining 1/2

    // Randomly choose a segment with 1/3 probability each
    const randomChoice = Math.random();

    let randomIndex;

    if (randomChoice < 1 / 3) {
        // First 1/6 segment
        randomIndex = Math.floor(Math.random() * (firstSegmentEnd + 1));
    } else if (randomChoice < 2 / 3) {
        // Next 1/3 segment
        const start = firstSegmentEnd + 1;
        randomIndex = start + Math.floor(Math.random() * (secondSegmentEnd - start + 1));
    } else {
        // Remaining 1/2 segment
        const start = secondSegmentEnd + 1;
        randomIndex = start + Math.floor(Math.random() * (thirdSegmentEnd - start));
    }

    return Math.min(randomIndex, arrayLength - 1); // Safeguard for edge cases
}

const AlbumShow = () => {
  const { albumId } = useParams();
  const [images, setImages] = useState([]);
  const [currentImage, setCurrentImage] = useState(null);
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

        // prepend new images to existing list
        setImages(imageList.concat(images));

        // Preload first image if this is first page
        if (!nextPage && imageList.length > 0) {
          setCurrentImage(imageList[0].url);
        }
      } catch (error) {
        console.error("Error fetching images:", error);
      }
    };

    // Initial fetch
    fetchImages();

    // Set up polling interval
    const pollInterval = setInterval(fetchImages, 30 * 1000);

    // Cleanup
    return () => clearInterval(pollInterval);
  }, [albumId, latestId]);

  // Random image selector
  useEffect(() => {
    const interval = setInterval(() => {
        if (images.length <= 1) return;
        const randomImage = images[getRandomIndex(images.length)].url;
        setCurrentImage(randomImage);
    }, 3000); // Change image every 3 seconds

    return () => clearInterval(interval); // Cleanup on unmount
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
