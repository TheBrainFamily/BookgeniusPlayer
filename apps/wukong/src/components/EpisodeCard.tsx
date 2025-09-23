import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Clock, Star, Volume2 } from "lucide-react";

interface EpisodeCardProps {
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  rating: number;
  year: string;
  tags: string[];
  featured?: boolean;
  comingSoon?: boolean;
  placeholder?: boolean;
  onClick?: () => void;
}

const EpisodeCard = ({ title, description, thumbnail, duration, rating, year, tags, featured = false, comingSoon = false, placeholder = false, onClick }: EpisodeCardProps) => {
  return (
    <div
      className={`relative group mystical-hover bg-card rounded-xl overflow-hidden border border-border/50 ${featured ? "ring-2 ring-accent/50" : ""} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="relative aspect-video overflow-hidden">
        <img src={thumbnail} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Play button overlay - only show if not coming soon */}
        {!comingSoon && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <Button variant="golden" size="lg" className="rounded-full w-16 h-16 p-0">
              <Play className="h-8 w-8 ml-1" />
            </Button>
          </div>
        )}

        {/* Gray overlay for coming soon episodes */}
        {comingSoon && <div className="absolute inset-0 bg-gray-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />}

        {/* Top badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="bg-accent/90 text-primary-foreground text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Audio indicator and Coming Soon badge */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {comingSoon && (
            <Badge variant="secondary" className="bg-amber-500/90 text-amber-900 text-xs font-semibold">
              Coming Soon
            </Badge>
          )}
          <Badge variant="outline" className="bg-background/80 border-accent/50 text-xs">
            <Volume2 className="h-3 w-3 mr-1" />
            Audio
          </Badge>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-xl font-traditional font-semibold text-foreground group-hover:text-accent transition-colors">{title}</h3>
          <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            {!comingSoon && !placeholder && rating > 0 && (
              <div className="flex items-center space-x-1">
                <Star className="h-4 w-4 fill-accent text-accent" />
                <span className="font-medium">{rating}</span>
              </div>
            )}
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>{duration}</span>
            </div>
            <span>{year}</span>
          </div>
        </div>

        <Button variant="mystical" className="w-full" disabled={comingSoon}>
          <Play className="h-4 w-4 mr-2" />
          {comingSoon ? "Coming Soon" : "Experience Episode"}
        </Button>
      </div>
    </div>
  );
};

export default EpisodeCard;
