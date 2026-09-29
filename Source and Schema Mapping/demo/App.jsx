import React from "react";
import contract from "../data-contract.json";
import { createSourceSchemaMappingService } from "../src/sourceSchemaMappingService.js";
import { SourceSchemaMappingWorkspace } from "../src/dashboard/index.js";

const service = createSourceSchemaMappingService({ contract });
export default function App(){ return <SourceSchemaMappingWorkspace service={service} />; }
