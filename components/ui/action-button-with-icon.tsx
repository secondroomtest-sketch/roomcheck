import { LucideIcon } from "lucide-react";

type ActionButtonWithIconProps = {
  icon: LucideIcon;
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  /** Soft surface (outline/light) instead of solid fill. */
  soft?: boolean;
};

export default function ActionButtonWithIcon({
  icon: Icon,
  label,
  type = "button",
  onClick,
  disabled = false,
  className = "",
  iconClassName = "",
  soft = false,
}: ActionButtonWithIconProps) {
  const tactile = soft ? "btn-tactile btn-tactile-soft btn-tactile-sm" : "btn-tactile btn-tactile-sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${tactile} inline-flex items-center gap-2 ${className}`.trim()}
    >
      <Icon size={14} className={iconClassName} />
      {label}
    </button>
  );
}
