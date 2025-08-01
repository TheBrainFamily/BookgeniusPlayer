import React from "react";

interface LineBreakProps {
  className?: string;
  style?: React.CSSProperties;
}

const LineBreak: React.FC<LineBreakProps> = ({ className, style }) => {
  return <span className={className} style={{ display: "block", height: "0", margin: "0", padding: "0", lineHeight: "1.2em", ...style }} />;
};

export default LineBreak;
