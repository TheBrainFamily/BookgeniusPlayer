import React from "react";
import { useParams } from "react-router-dom"; // Assuming you use React Router

const ReaderPage = () => {
  // Get the book slug from the URL, e.g., "Romeo-And-Juliet"
  const { slug } = useParams<{ slug: string }>();

  // Construct the correct URL for the player app, which is served on http://localhost
  const playerUrl = `http://localhost/?book=${slug}`;

  return (
    <div className="w-full h-screen flex flex-col">
      <iframe src={playerUrl} title={`Book Player - ${slug}`} className="w-full h-full border-0" />
    </div>
  );
};

export default ReaderPage;
