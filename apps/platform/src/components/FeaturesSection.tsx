import { Users, MessageCircleQuestion, MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

const featureIcons = [Users, MessageCircleQuestion, MonitorSmartphone] as const;

const FeaturesSection = () => {
  const { t } = useTranslation();

  const features = [
    {
      icon: featureIcons[0],
      title: t("features.characterTracking.title", "Never Forget Who's Who"),
      description: t(
        "features.characterTracking.description",
        "Tap any character's name to see who they are, how they connect to others, and what's happened with them — only up to where you've read. No spoilers.",
      ),
    },
    {
      icon: featureIcons[1],
      title: t("features.qa.title", "Spoiler-Free Q&A"),
      description: t(
        "features.qa.description",
        "Curious about the plot? Ask anything about the book and get answers based only on what you've read so far. Like a friend who's already read it.",
      ),
    },
    {
      icon: featureIcons[2],
      title: t("features.readAnywhere.title", "Read Anywhere"),
      description: t(
        "features.readAnywhere.description",
        "Your reading position syncs across devices. Customize fonts, themes, and graphics settings to match how you like to read.",
      ),
    },
  ];

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("features.heading", "A Smarter Way to")}{" "}
            <span className="text-library-gold">{t("features.headingHighlight", "Read")}</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t(
              "features.subheading",
              "Every book in our library comes with tools that make reading more enjoyable.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-8 transition-all duration-300 hover:border-library-gold/30 hover:shadow-lg hover:shadow-library-gold/5"
            >
              <div className="w-12 h-12 rounded-lg bg-library-gold/10 flex items-center justify-center mb-5">
                <feature.icon className="w-6 h-6 text-library-gold" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-3">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
