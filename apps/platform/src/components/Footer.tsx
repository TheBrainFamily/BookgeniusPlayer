import { BookOpen, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@platform/components/ui/button";

const Footer = () => {
  return (
    <footer className="bg-library-mahogany/80 backdrop-blur-sm border-t border-library-walnut">
      <div className="container mx-auto px-6 md:px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <BookOpen className="h-8 w-8 text-library-gold animate-candleflicker" />
              <h3 className="text-xl font-bold text-foreground">BookGenius</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Experience literature like never before with our immersive visual novels featuring beautiful animations and atmospheric soundtracks.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">Quick Links</h4>
            <div className="space-y-2 flex flex-col">
              {["View Collection", "My Progress", "Reading History", "Settings"].map((link) => (
                <Button key={link} variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-library-gold text-left hover:bg-transparent justify-start w-fit">
                  {link}
                </Button>
              ))}
            </div>
          </div>

          {/* Genres */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">Featured Authors</h4>
            <div className="space-y-2 flex flex-col">
              {["William Shakespeare", "George Orwell", "Lewis Carroll", "Hans Christian Andersen"].map((author) => (
                <Button key={author} variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-library-gold hover:bg-transparent text-left justify-start w-fit">
                  {author}
                </Button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">Contact</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span className="text-sm">{import.meta.env.VITE_SUPPORT_EMAIL}</span>
              </div>
              <div className="flex items-center space-x-3 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span className="text-sm"></span>
              </div>
              <div className="flex items-center space-x-3 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">Digital Realm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-library-walnut mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-muted-foreground text-sm">© 2025 BookGenius. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            {["Privacy Policy", "Terms of Service", "Cookie Policy"].map((link) => (
              <Button key={link} variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-library-gold hover:bg-transparent text-sm">
                {link}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
