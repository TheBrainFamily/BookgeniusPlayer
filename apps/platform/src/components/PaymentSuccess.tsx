import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle, BookOpen, Crown, ArrowRight } from "lucide-react";

const PaymentSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  const paymentType = searchParams.get("type");
  const bookSlug = searchParams.get("slug");

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (paymentType === "book" && bookSlug) {
            navigate(`/reader/?book=${bookSlug}`);
          } else {
            navigate("/");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, paymentType, bookSlug]);

  const handleContinue = () => {
    if (paymentType === "book" && bookSlug) {
      navigate(`/reader/?book=${bookSlug}`);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card/95 backdrop-blur border-green-500/20">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-500">Payment Successful!</CardTitle>
        </CardHeader>

        <CardContent className="text-center space-y-6">
          {paymentType === "book" ? (
            <>
              <div className="space-y-2">
                <BookOpen className="h-8 w-8 text-library-gold mx-auto" />
                <h3 className="text-lg font-semibold">Book Purchased</h3>
                <p className="text-muted-foreground">
                  You now have lifetime access to this visual novel. Enjoy your reading!
                </p>
              </div>
              <Button
                onClick={handleContinue}
                className="w-full bg-library-gold hover:bg-library-gold/90 text-library-mahogany"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Continue Reading
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Crown className="h-8 w-8 text-library-gold mx-auto" />
                <h3 className="text-lg font-semibold">Welcome to Premium!</h3>
                <p className="text-muted-foreground">
                  You now have access to our entire library of visual novels. Explore and enjoy!
                </p>
              </div>
              <Button
                onClick={handleContinue}
                className="w-full bg-library-gold hover:bg-library-gold/90 text-library-mahogany"
              >
                <Crown className="h-4 w-4 mr-2" />
                Explore Library
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          <div className="text-sm text-muted-foreground">Redirecting in {countdown} seconds...</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
