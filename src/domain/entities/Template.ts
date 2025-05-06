export type VariableMetadata = {
  type: 'text' | 'number' | 'date' | 'image' | 'file' | 'url' | 'boolean';
  description?: string;
  required?: boolean;
  defaultValue?: any;
};

export type TemplateVariables = Record<string, VariableMetadata>;

export class Template {
  id?: string;
  name: string;
  content: string;
  variables?: TemplateVariables;
  broadcastId: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(props: {
    id?: string;
    name: string;
    content: string;
    variables?: TemplateVariables;
    broadcastId: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.content = props.content;
    this.variables = props.variables;
    this.broadcastId = props.broadcastId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  // Método para processar variáveis no template
  processVariables(variables: Record<string, any>): string {
    let processedContent = this.content;
    
    // Substitui todas as variáveis encontradas no padrão {{variableName}}
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      
      // Processamento baseado no tipo da variável
      let processedValue = value;
      const metadata = this.variables?.[key];
      
      if (metadata) {
        switch (metadata.type) {
          case 'image':
          case 'file':
            // Para imagens e arquivos, insere a URL
            processedValue = value?.url || value || '';
            break;
          case 'date':
            // Formata datas se necessário
            if (value instanceof Date) {
              processedValue = value.toLocaleDateString();
            }
            break;
          case 'boolean':
            processedValue = value ? 'Sim' : 'Não';
            break;
        }
      }
      
      processedContent = processedContent.replace(pattern, String(processedValue));
    }
    
    return processedContent;
  }

  // Método para analisar o conteúdo e extrair variáveis
  extractVariablesFromContent(): string[] {
    const pattern = /{{([a-zA-Z0-9_]+)}}/g;
    const variables: string[] = [];
    let match;
    
    while ((match = pattern.exec(this.content)) !== null) {
      variables.push(match[1]);
    }
    
    return variables;
  }

  // Validar se todas as variáveis necessárias foram fornecidas
  validateVariables(providedVariables: Record<string, any>): { valid: boolean; missing: string[] } {
    const requiredVariables: string[] = [];
    
    // Verifica se há metadados de variáveis definidos
    if (this.variables) {
      Object.entries(this.variables).forEach(([name, metadata]) => {
        if (metadata.required && providedVariables[name] === undefined) {
          requiredVariables.push(name);
        }
      });
    } else {
      // Se não houver metadados, verifica todas as variáveis do template
      const allVariables = this.extractVariablesFromContent();
      allVariables.forEach(variable => {
        if (providedVariables[variable] === undefined) {
          requiredVariables.push(variable);
        }
      });
    }
    
    return {
      valid: requiredVariables.length === 0,
      missing: requiredVariables
    };
  }
}
