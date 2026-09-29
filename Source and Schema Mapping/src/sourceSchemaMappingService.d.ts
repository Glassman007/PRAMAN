export type Row = Record<string, unknown>;
export type TableLoader = (logicalTableName: string) => Promise<Row[]> | Row[];

export interface SourceSchemaMappingService {
  getSources(): Row[];
  getSource(sourceIdOrType: string): Row | null;
  getSourceSchema(sourceIdOrType: string): Row | null;
  getSourceRecords(sourceIdOrType: string): Promise<Row[]>;
  canLoadSourceRecords(): boolean;
  getSourceStatistics(sourceIdOrType: string): Row | null;
  getSpatialMetadata(sourceIdOrType: string): Row | null;
  getMappings(sourceIdOrType: string): Row | null;
  getMappingAudit(sourceIdOrType: string): Row | null;
  getCanonicalSchema(): Row;
  getTransformationRules(sourceIdOrType: string): Row | null;
  getMappingIssues(sourceIdOrType: string): Row | null;
  getQualityProfile(sourceIdOrType: string): Row | null;
  getLineage(sourceIdOrType: string, field: string): Row | null;
  getAvailableVersions(sourceIdOrType: string): Row | null;
  getFieldFrequencies(sourceIdOrType: string, field: string): Promise<Array<{ value: string; count: number }>>;
  getRecordLineage(sourceIdOrType: string, observationId: string): Promise<Row | null>;
  getFeatureSupport(): Row;
  getUnavailableFeatures(): string[];
  getSourceFieldProfiles(sourceIdOrType: string): Row[];
  getSourceGeometryFieldProfiles(sourceIdOrType: string): Row[];
  getSchemaMappingModel(sourceIdOrType: string): Row | null;
  getIdentifierInterpretation(sourceIdOrType: string): Row | null;
  getUnmappedSourceFieldClassification(sourceIdOrType: string): Row | null;
  getMissingCanonicalFieldClassification(sourceIdOrType: string): Row | null;
  getValueDictionary(sourceIdOrType: string): Row | null;
  getSourceQualitySummary(sourceIdOrType: string): Row | null;
  getFieldQualityProfiles(sourceIdOrType: string): Row[];
  getExceptionQueue(sourceIdOrType: string): Row[];
  getExceptionCategories(sourceIdOrType: string): Array<{ category: string; count: number }>;
  getException(sourceIdOrType: string, issueId: string): Row | null;
  getExceptionRecordComparison(sourceIdOrType: string, issueIdOrObservationId: string): Row | null;
  getProvenanceSubjects(sourceIdOrType: string): Row[];
  getAttributeProvenance(sourceIdOrType: string, subjectKey: string, recordContext?: { observationId?: string | null; issueId?: string | null } | null): Row | null;
  getMappingImpact(sourceIdOrType: string, relationId: string): Row | null;
  getSourceSchemaHistory(sourceIdOrType: string): Row | null;
  getVersionComparison(sourceIdOrType: string, leftId?: string | null, rightId?: string | null): Row | null;
  getCurrentMappingConfiguration(sourceIdOrType: string): Row | null;
  getExportableMappingConfiguration(sourceIdOrType: string): Row | null;
  getSourceOverview(sourceIdOrType: string): Row | null;
  getArchitectureStages(sourceIdOrType: string): Row[];
  getCanonicalDomains(): Row[];
  getSourceCanonicalMatrix(): Row;
}

export function createSourceSchemaMappingService(args: {
  contract: Row;
  loadTable?: TableLoader;
}): SourceSchemaMappingService;

export const NOT_AVAILABLE: "Not available";
