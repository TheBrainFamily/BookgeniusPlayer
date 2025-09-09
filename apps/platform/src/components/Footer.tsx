import { BookOpen, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@platform/components/ui/button";
import { useTranslation } from "react-i18next";

interface FooterProps {
  onSearchQuery: (query: string) => void;
}

const Footer = ({ onSearchQuery }: FooterProps) => {
  const { t } = useTranslation();
  return (
    <footer className="bg-library-mahogany/80 backdrop-blur-sm border-t border-library-walnut">
      <div className="container mx-auto px-6 md:px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <BookOpen className="h-8 w-8 text-library-gold animate-candleflicker" />
              <h3 className="text-xl font-bold text-foreground">
                {t("hero.bookGenius").split(/(?=[A-Z])/)[0]}
                <span className="text-library-gold">{t("hero.bookGenius").split(/(?=[A-Z])/)[1]}</span>
              </h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("footer.description")}</p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">{t("footer.quickLinks.title")}</h4>
            <div className="space-y-2 flex flex-col">
              <Button
                asChild
                onClick={() => onSearchQuery("")}
                variant="ghost"
                className="p-0 h-auto text-muted-foreground hover:text-library-gold text-left hover:bg-transparent justify-start w-fit"
              >
                <a href="#book-collection">{t("footer.quickLinks.viewCollection")}</a>
              </Button>
              {[t("footer.quickLinks.myProgress"), t("footer.quickLinks.readingHistory"), t("footer.quickLinks.settings")].map((link) => (
                <Button key={link} variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-library-gold text-left hover:bg-transparent justify-start w-fit">
                  {link}
                </Button>
              ))}
            </div>
          </div>

          {/* Genres */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">{t("footer.featuredAuthors")}</h4>
            <div className="space-y-2 flex flex-col">
              {["William Shakespeare", "George Orwell", "Lewis Carroll", "Hans Christian Andersen"].map((author) => (
                <Button
                  key={author}
                  variant="ghost"
                  onClick={() => onSearchQuery(author)}
                  className="p-0 h-auto text-muted-foreground hover:text-library-gold hover:bg-transparent text-left justify-start w-fit"
                >
                  {author}
                </Button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-library-gold">{t("footer.contact")}</h4>
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
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} {t("hero.bookGenius")}. {t("footer.allRights")}
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            {[t("footer.privacyPolicy"), t("footer.termsOfService"), t("footer.cookiePolicy")].map((link) => (
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
