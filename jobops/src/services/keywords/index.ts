type Keyword = { name: string; aliases?: string[] };

export const keywordDictionary: Record<string, Keyword[]> = {
  Languages: [{ name: 'Python' }, { name: 'Java' }, { name: 'TypeScript' }, { name: 'JavaScript' }, { name: 'Go', aliases: ['golang'] }, { name: 'Rust' }, { name: 'C++', aliases: ['cpp'] }, { name: 'C#', aliases: ['csharp'] }, { name: 'SQL' }, { name: 'Scala' }, { name: 'Kotlin' }, { name: 'Ruby' }],
  Frameworks: [{ name: 'Spring Boot', aliases: ['springboot'] }, { name: 'Spring' }, { name: 'FastAPI', aliases: ['fast api'] }, { name: 'Django' }, { name: 'Flask' }, { name: 'React', aliases: ['react.js', 'reactjs'] }, { name: 'Next.js', aliases: ['nextjs'] }, { name: 'Node.js', aliases: ['nodejs'] }, { name: 'Express' }, { name: '.NET', aliases: ['dotnet'] }, { name: 'Rails', aliases: ['ruby on rails'] }],
  Databases: [{ name: 'PostgreSQL', aliases: ['postgres', 'postgre sql'] }, { name: 'MySQL' }, { name: 'MongoDB' }, { name: 'Redis' }, { name: 'DynamoDB' }, { name: 'Elasticsearch' }, { name: 'Cassandra' }, { name: 'SQLite' }],
  Messaging: [{ name: 'Kafka', aliases: ['apache kafka'] }, { name: 'RabbitMQ' }, { name: 'SQS' }, { name: 'Pub/Sub', aliases: ['pubsub', 'pub sub'] }, { name: 'NATS' }],
  Cloud: [{ name: 'AWS', aliases: ['amazon web services'] }, { name: 'Azure', aliases: ['microsoft azure'] }, { name: 'GCP', aliases: ['google cloud', 'google cloud platform'] }, { name: 'Cloudflare' }, { name: 'Lambda', aliases: ['aws lambda'] }, { name: 'S3', aliases: ['amazon s3'] }],
  Infrastructure: [{ name: 'Docker' }, { name: 'Kubernetes', aliases: ['k8s'] }, { name: 'Terraform' }, { name: 'Linux' }, { name: 'CI/CD', aliases: ['ci cd', 'continuous integration', 'continuous delivery'] }, { name: 'GitHub Actions' }, { name: 'Jenkins' }, { name: 'Ansible' }],
  Data: [{ name: 'Snowflake' }, { name: 'Spark', aliases: ['apache spark', 'pyspark'] }, { name: 'Airflow', aliases: ['apache airflow'] }, { name: 'dbt' }, { name: 'Databricks' }, { name: 'ETL' }, { name: 'Data pipelines' }, { name: 'Data engineering' }, { name: 'BigQuery' }],
  'AI / ML': [{ name: 'Machine learning', aliases: ['ml'] }, { name: 'PyTorch' }, { name: 'TensorFlow' }, { name: 'scikit-learn', aliases: ['sklearn'] }, { name: 'NLP', aliases: ['natural language processing'] }, { name: 'MLOps' }, { name: 'LLM', aliases: ['large language models'] }],
  Architecture: [{ name: 'Distributed systems' }, { name: 'Microservices' }, { name: 'Event-driven architecture', aliases: ['event driven architecture', 'event-driven systems'] }, { name: 'REST', aliases: ['restful'] }, { name: 'gRPC' }, { name: 'GraphQL' }, { name: 'System design' }, { name: 'API design' }, { name: 'Domain-driven design', aliases: ['domain driven design', 'ddd'] }, { name: 'Scalability' }],
  Testing: [{ name: 'Unit testing', aliases: ['unit tests'] }, { name: 'Integration testing', aliases: ['integration tests'] }, { name: 'Playwright' }, { name: 'Jest' }, { name: 'Vitest' }, { name: 'JUnit' }, { name: 'pytest' }, { name: 'TDD', aliases: ['test-driven development'] }],
  Observability: [{ name: 'Prometheus' }, { name: 'Grafana' }, { name: 'OpenTelemetry' }, { name: 'Datadog' }, { name: 'Observability' }, { name: 'SRE', aliases: ['site reliability engineering'] }],
  Leadership: [{ name: 'Technical leadership' }, { name: 'Mentoring', aliases: ['mentorship'] }, { name: 'Stakeholder management' }, { name: 'Team leadership' }, { name: 'Hiring' }, { name: 'Code review', aliases: ['code reviews'] }],
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const entries = Object.entries(keywordDictionary).flatMap(([category, keywords]) => keywords.map((keyword) => ({
  ...keyword, category,
  pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${[keyword.name, ...keyword.aliases ?? []].map(escapeRegex).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'iu'),
})));
const canonical = new Map(entries.flatMap((entry) => [entry.name, ...entry.aliases ?? []].map((name) => [name.toLowerCase(), entry.name])));
const categories = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry.category]));

export function extractKeywords(text: string): string[] {
  return entries.filter((entry) => entry.pattern.test(text)).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

function normalizeWords(words: string[]) {
  const unique = new Map<string, string>();
  for (const value of words) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const word = canonical.get(trimmed.toLowerCase()) ?? trimmed;
    unique.set(word.toLowerCase(), word);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

export function groupKeywords(words: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const word of normalizeWords(words)) {
    const category = categories.get(word.toLowerCase()) ?? 'Other';
    (groups[category] ??= []).push(word);
  }
  return groups;
}

export function compareKeywords(jobKeywords: string[], resumeKeywords: string[]) {
  const job = normalizeWords(jobKeywords);
  const resume = normalizeWords(resumeKeywords);
  const jobSet = new Set(job.map((word) => word.toLowerCase()));
  const resumeSet = new Set(resume.map((word) => word.toLowerCase()));
  const matched = job.filter((word) => resumeSet.has(word.toLowerCase()));
  const missing = job.filter((word) => !resumeSet.has(word.toLowerCase()));
  const resumeOnly = resume.filter((word) => !jobSet.has(word.toLowerCase()));
  return { score: job.length ? Math.round(matched.length / job.length * 100) : 0, matched, missing, resumeOnly };
}
