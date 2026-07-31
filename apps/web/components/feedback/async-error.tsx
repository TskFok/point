import { Button, Card } from "@point-quest/ui";
import { RefreshCw, WifiOff } from "lucide-react";

type AsyncErrorProps = {
  message: string;
  onRetry: () => void;
};

export function AsyncError({ message, onRetry }: AsyncErrorProps) {
  return (
    <Card className="async-error" role="alert">
      <WifiOff aria-hidden="true" />
      <div>
        <h2>内容暂时没有加载成功</h2>
        <p>{message}</p>
      </div>
      <Button onClick={onRetry} variant="secondary">
        <RefreshCw aria-hidden="true" />
        重新加载
      </Button>
    </Card>
  );
}
