import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  isThirdParty: boolean;
  thirdPartyName: string;
  onIsThirdPartyChange: (v: boolean) => void;
  onThirdPartyNameChange: (v: string) => void;
  /** "expense" | "income" — muda a label */
  type?: 'expense' | 'income' | 'future_expense' | 'future_income';
}

export default function ThirdPartyField({
  isThirdParty,
  thirdPartyName,
  onIsThirdPartyChange,
  onThirdPartyNameChange,
  type = 'expense',
}: Props) {
  const labels: Record<string, { question: string; placeholder: string; nameLabel: string }> = {
    expense: { question: 'Essa despesa é de outra pessoa?', placeholder: 'Ex: João...', nameLabel: 'Nome da pessoa' },
    income: { question: 'Essa receita é de outra pessoa?', placeholder: 'Ex: João...', nameLabel: 'Nome da pessoa' },
    future_expense: { question: 'Vai pagar para outra pessoa?', placeholder: 'Ex: João...', nameLabel: 'A quem pagar?' },
    future_income: { question: 'Vai receber de outra pessoa?', placeholder: 'Ex: Cliente Maria...', nameLabel: 'Quem vai te pagar?' },
  };
  const cfg = labels[type];

  return (
    <>
      <div className="space-y-2">
        <Label>{cfg.question}</Label>
        <Select value={isThirdParty ? 'yes' : 'no'} onValueChange={(v) => onIsThirdPartyChange(v === 'yes')}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="no">Não</SelectItem>
            <SelectItem value="yes">Sim</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isThirdParty && (
        <div className="space-y-2">
          <Label>{cfg.nameLabel}</Label>
          <Input
            value={thirdPartyName}
            onChange={(e) => onThirdPartyNameChange(e.target.value)}
            placeholder={cfg.placeholder}
            className="bg-secondary border-border"
            required
          />
        </div>
      )}
    </>
  );
}
