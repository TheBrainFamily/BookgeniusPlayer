import { Home, BookOpen } from "lucide-react";
import { Button } from "@platform/components/ui/button";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <BookOpen className="h-8 w-8 text-library-gold" />
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Terms of Service</h1>
        </div>

        <p className="text-muted-foreground mb-8">Last updated: January 2025</p>

        <div className="space-y-8 text-foreground/90">
          <p className="leading-relaxed">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the
            BookGenius platform, including the websites bookgeniusz.pl and bookgenius.net
            (collectively, the &quot;Service&quot;), operated by Łukasz Gandecki (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;).
          </p>

          <p className="leading-relaxed">
            By accessing or using the Service, you agree to be bound by these Terms.
          </p>

          <Section title="1. License to Use the Service">
            <p>
              We grant you a limited, non-exclusive, non-transferable, revocable license to access
              and use the Service for personal, non-commercial purposes only.
            </p>
          </Section>

          <Section title="2. Content and Intellectual Property">
            <h3 className="text-lg font-semibold text-library-gold mt-4 mb-2">
              2.1 Audiovisual Content
            </h3>
            <p className="mb-4">
              The audiovisual content available through the Service—including but not limited to
              audio narrations, character images, animations, videos, and music—is provided for
              personal playback only. You may not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/80 ml-4">
              <li>
                Copy, download, or store audiovisual content except as temporarily cached by your
                browser or device for normal playback
              </li>
              <li>Redistribute, republish, or share audiovisual content through any medium</li>
              <li>Use audiovisual content for commercial purposes</li>
              <li>Create derivative works from audiovisual content</li>
              <li>Remove or alter any copyright, trademark, or other proprietary notices</li>
            </ul>

            <h3 className="text-lg font-semibold text-library-gold mt-6 mb-2">
              2.2 Literary Works
            </h3>
            <p>
              The literary texts presented through the Service may be in the public domain or used
              under license. Your rights to these texts are governed by applicable copyright law and
              any specific licenses indicated alongside the content.
            </p>
          </Section>

          <Section title="3. Prohibited Activities">
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-foreground/80 ml-4">
              <li>
                Use automated systems, bots, crawlers, or scrapers to access, collect, or download
                content from the Service
              </li>
              <li>Circumvent, disable, or interfere with security features of the Service</li>
              <li>Use the Service to build a competing product or service</li>
              <li>
                Deploy any content obtained from the Service as part of another publicly accessible
                application or service
              </li>
              <li>
                Attempt to gain unauthorized access to any portion of the Service or any systems or
                networks connected to it
              </li>
              <li>
                Use the Service in any manner that could damage, disable, overburden, or impair the
                Service
              </li>
            </ul>
          </Section>

          <Section title="4. User Accounts">
            <p>
              If you create an account, you are responsible for maintaining the confidentiality of
              your credentials and for all activities that occur under your account.
            </p>
          </Section>

          <Section title="5. Purchases and Subscriptions">
            <p>
              Some content may require payment. All purchases are final unless otherwise required by
              applicable law. We reserve the right to modify pricing at any time.
            </p>
          </Section>

          <Section title="6. Termination">
            <p>
              We may terminate or suspend your access to the Service immediately, without prior
              notice, for any reason, including breach of these Terms.
            </p>
          </Section>

          <Section title="7. Disclaimer of Warranties">
            <p className="uppercase text-sm tracking-wide">
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without
              warranties of any kind, either express or implied.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p className="uppercase text-sm tracking-wide">
              To the maximum extent permitted by law, we shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising from your use of the
              Service.
            </p>
          </Section>

          <Section title="9. Governing Law">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of Poland,
              without regard to its conflict of law provisions.
            </p>
          </Section>

          <Section title="10. Changes to Terms">
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of
              significant changes by posting a notice on the Service.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>For questions about these Terms, please contact us through the Service.</p>
          </Section>

          <div className="border-t border-library-walnut pt-6 mt-8">
            <p className="text-muted-foreground italic">
              By using BookGenius, you acknowledge that you have read, understood, and agree to be
              bound by these Terms of Service.
            </p>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            asChild
            size="lg"
            className="bg-library-gold hover:bg-library-gold-glow text-library-mahogany font-semibold"
          >
            <a href="/">
              <Home className="mr-2 h-5 w-5" />
              Back to Home
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-xl font-semibold text-library-gold mb-3">{title}</h2>
    <div className="leading-relaxed">{children}</div>
  </section>
);

export default Terms;
