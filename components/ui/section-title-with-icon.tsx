import { LucideIcon } from "lucide-react";

type SectionTitleWithIconProps = {
  icon: LucideIcon;
  title: string;
  className?: string;
  iconClassName?: string;
};

export default function SectionTitleWithIcon({
  icon: Icon,
  title,
  className = "",
  iconClassName = "",
}: SectionTitleWithIconProps) {
  return (
    <h2 className={`flex items-center gap-2 text-lg font-semibold ${className}`.trim()}>
      <Icon size={18} className={iconClassName} />
      {title}
    </h2>
  );
}
