import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-[100dvh] bg-background gap-6 px-6 text-center">
          <h1 className="font-serif text-3xl text-primary">PsalmGuide</h1>
          <p className="font-serif text-xl text-foreground">Something went quiet.</p>
          <p className="text-muted-foreground text-sm max-w-sm">
            An unexpected error occurred. Reloading will restore your session.
          </p>
          <Button
            onClick={this.handleReload}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-reload"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
