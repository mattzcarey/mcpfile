import ReactMarkdown from 'react-markdown';
import { JsonBlock } from './components/JsonBlock';
import { TypeScriptBlock } from './components/TypeScriptBlock';
import './styles.css';

const content = `# Lorem Ipsum Documentation

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Getting Started

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

### Installation

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

- Lorem ipsum dolor sit amet
- Consectetur adipiscing elit
- Sed do eiusmod tempor incididunt
- Ut labore et dolore magna aliqua

## JSON Example

Here's a sample JSON configuration:

\`\`\`json
{
  "name": "example-project",
  "version": "1.0.0",
  "description": "Lorem ipsum dolor sit amet",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "dotenv": "^16.0.0"
  }
}
\`\`\`

## TypeScript Example

Here's a sample TypeScript function:

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(userId: number): Promise<User> {
  const response = await fetch(\`/api/users/\${userId}\`);
  const data = await response.json();
  return data;
}

export { fetchUser, User };
\`\`\`

## More Information

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

### Features

- Sed ut perspiciatis unde omnis
- Iste natus error sit voluptatem
- Accusantium doloremque laudantium
- Totam rem aperiam eaque ipsa

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

export function App() {
  return (
    <div className="container">
      <div className="markdown">
        <ReactMarkdown
          components={{
            code({ node, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const code = String(children).replace(/\n$/, '');

              if (match) {
                if (match[1] === 'json') {
                  return <JsonBlock code={code} />;
                }
                if (match[1] === 'typescript' || match[1] === 'ts') {
                  return <TypeScriptBlock code={code} />;
                }
              }

              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
