import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  value: string;
  onChange: (v: string) => void;
  thirdPartyNames: string[];
  className?: string;
}

export default function PersonFilter({ value, onChange, thirdPartyNames, className }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className || 'bg-secondary border-border text-xs sm:text-sm h-9'}>
        <SelectValue placeholder="Responsável" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos</SelectItem>
        <SelectItem value="mine">Minhas</SelectItem>
        <SelectItem value="third_party">De terceiros</SelectItem>
        {thirdPartyNames.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Por pessoa</div>
            {thirdPartyNames.map((name) => (
              <SelectItem key={name} value={name}>👤 {name}</SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
