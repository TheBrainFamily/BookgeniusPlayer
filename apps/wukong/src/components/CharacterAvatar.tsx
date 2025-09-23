import { useState } from "react";
import CharacterModal from "./CharacterModal";

interface CharacterAvatarProps {
  name: string;
  image: string;
  title?: string;
  size?: "sm" | "md" | "lg";
  description: string;
}

const CharacterAvatar = ({ name, image, title, size = "md", description }: CharacterAvatarProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const sizeClasses = { sm: "w-16 h-16", md: "w-24 h-24", lg: "w-32 h-32" };

  const textSizeClasses = { sm: "text-sm", md: "text-base", lg: "text-lg" };

  return (
    <>
      <div className="group text-center space-y-3 cursor-pointer" onClick={() => setIsModalOpen(true)}>
        <div className={`relative ${sizeClasses[size]} mx-auto`}>
          <div className="w-full h-full rounded-full overflow-hidden border-3 border-accent/30 group-hover:border-accent transition-all duration-300 mystical-hover">
            <img src={image} alt={name} className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 rounded-full bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
        <div className="space-y-1">
          <h4 className={`font-traditional font-semibold text-foreground group-hover:text-accent transition-colors ${textSizeClasses[size]}`}>{name}</h4>
          {title && <p className={`text-muted-foreground ${size === "lg" ? "text-sm" : "text-xs"}`}>{title}</p>}
        </div>
      </div>

      <CharacterModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} name={name} image={image} title={title} description={description} />
    </>
  );
};

export default CharacterAvatar;
