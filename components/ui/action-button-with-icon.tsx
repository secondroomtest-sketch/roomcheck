import { LucideIcon } from "lucide-react";

type ActionButtonWithIconProps = {
  icon: LucideIcon;
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
};

export default function ActionButtonWithIcon({
  icon: Icon,
  label,
  type = "button",
  onClick,
  disabled = false,
  className = "",
  iconClassName = "",
}: ActionButtonWithIconProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 ${className}`.trim()}
    >
      <Icon size={14} className={iconClassName} />
      {label}
    </button>
  );
}
