import {
  ObjectTypeDefinitionNode,
  FieldDefinitionNode,
  ListTypeNode,
  NamedTypeNode,
  TypeDefinitionNode,
  InterfaceTypeDefinitionNode,
} from 'graphql';
import { GraphQLSchemaParser, Visitors, SchemaNode } from './SchemaParser';
import { WarthogModel, Field, ObjectType } from '../model';
import Debug from 'debug';
import { ENTITY_DIRECTIVE, UNIQUE_DIRECTIVE, VARIANT_DIRECTIVE } from './constant';
import { FTSDirective, FULL_TEXT_SEARCHABLE_DIRECTIVE } from './FTSDirective';
import { availableTypes } from '../model/ScalarTypes';
import * as DerivedFrom from './DerivedFromDirective';
import { RelationshipGenerator } from '../generate/RelationshipGenerator';

const debug = Debug('qnode-cli:model-generator');

/**
 * Parse a graphql schema and generate model defination strings for Warthog. It use GraphQLSchemaParser for parsing
 * @constructor(schemaPath: string)
 */
export class WarthogModelBuilder {
  private _schemaParser: GraphQLSchemaParser;
  private _model: WarthogModel;
  private _fieldsToProcess: Field[] = [];

  constructor(schemaPath: string) {
    this._schemaParser = new GraphQLSchemaParser(schemaPath);
    this._model = new WarthogModel();
  }

  /**
   * Returns true if type is Scalar, String, Int, Boolean, Float otherwise false
   * Scalar types are also built-in
   */
  private _isBuildinType(type: string): boolean {
    return type in availableTypes;
  }

  private _listType(typeNode: ListTypeNode, fieldName: string): Field {
    let field: Field;

    if (typeNode.type.kind === 'ListType') {
      throw new Error('Only one level lists are allowed');
    } else if (typeNode.type.kind === 'NamedType') {
      field = this._namedType(fieldName, typeNode.type);
      field.isList = true;
    } else {
      if (typeNode.type.type.kind === 'ListType') {
        throw new Error('Only one level lists are allowed');
      }
      field = this._namedType(fieldName, typeNode.type.type);
      field.nullable = false;
    }

    field.isList = true;
    return field;
  }

  /**
   * Create a new Field type from NamedTypeNode
   * @param name string
   * @param namedTypeNode NamedTypeNode
   * @param directives: additional directives of FieldDefinitionNode
   */
  private _namedType(name: string, namedTypeNode: NamedTypeNode): Field {
    const field = new Field(name, namedTypeNode.name.value);
    field.isBuildinType = this._isBuildinType(field.type);

    this._fieldsToProcess.push(field);

    return field;
  }

  /**
   * Mark the object type as entity if '@entity' directive is used
   * @param o ObjectTypeDefinitionNode
   */
  private isEntity(o: TypeDefinitionNode): boolean {
    const entityDirective = o.directives?.find(d => d.name.value === ENTITY_DIRECTIVE);
    return entityDirective ? true : false;
  }

  private isVariant(o: TypeDefinitionNode): boolean {
    if (o.directives == undefined) {
      return false;
    }

    return o.directives.findIndex(d => d.name.value === VARIANT_DIRECTIVE) >= 0;
  }

  private isUnique(field: FieldDefinitionNode): boolean {
    const entityDirective = field.directives?.find(d => d.name.value === UNIQUE_DIRECTIVE);
    return entityDirective ? true : false;
  }

  /**
   * Generate a new ObjectType from ObjectTypeDefinitionNode
   * @param o ObjectTypeDefinitionNode
   */
  private generateTypeDefination(o: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): ObjectType {
    return {
      name: o.name.value,
      fields: this.getFields(o),
      isEntity: this.isEntity(o),
      isVariant: this.isVariant(o),
      description: o.description?.value,
      isInterface: o.kind === 'InterfaceTypeDefinition',
      interfaces: o.kind === 'ObjectTypeDefinition' ? this.getInterfaces(o) : [],
    } as ObjectType;
  }

  private getInterfaces(o: ObjectTypeDefinitionNode): ObjectType[] {
    if (!o.interfaces) {
      return [];
    }
    const interfaces: ObjectType[] = [];
    o.interfaces.map(nameNode => {
      if (nameNode.kind !== 'NamedType') {
        throw new Error(`Unrecognized interface type: ${JSON.stringify(nameNode, null, 2)}`);
      }
      const name = nameNode.name.value;
      interfaces.push(this._model.lookupInterface(name));
    });

    if (interfaces.length > 1) {
      throw new Error(`A type can implement at most one interface`);
    }
    return interfaces;
  }

  private getFields(o: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): Field[] {
    const fields = this._schemaParser.getFields(o).map((fieldNode: FieldDefinitionNode) => {
      const typeNode = fieldNode.type;
      const fieldName = fieldNode.name.value;

      let field: Field;

      if (typeNode.kind === 'NamedType') {
        field = this._namedType(fieldName, typeNode);
      } else if (typeNode.kind === 'NonNullType') {
        field =
          typeNode.type.kind === 'NamedType'
            ? this._namedType(fieldName, typeNode.type)
            : this._listType(typeNode.type, fieldName);

        field.nullable = false;
      } else if (typeNode.kind === 'ListType') {
        field = this._listType(typeNode, fieldName);
      } else {
        throw new Error(`Unrecognized type. ${JSON.stringify(typeNode, null, 2)}`);
      }
      field.description = fieldNode.description?.value;
      field.unique = this.isUnique(fieldNode);
      DerivedFrom.addDerivedFromIfy(fieldNode, field);
      return field;
    });
    debug(`Read and parsed fields: ${JSON.stringify(fields, null, 2)}`);
    return fields;
  }

  private generateInterfaces() {
    this._schemaParser.getInterfaceTypes().map(i => {
      const astNode = i.astNode as InterfaceTypeDefinitionNode;
      if (astNode && this.isEntity(astNode)) {
        this._model.addInterface(this.generateTypeDefination(astNode));
      }
    });
  }

  private generateEntities() {
    this._schemaParser
      .getObjectDefinations()
      .filter(o => this.isEntity(o))
      .map(o => {
        const objType = this.generateTypeDefination(o);
        this._model.addEntity(objType);
      });
  }

  private generateVariants() {
    this._schemaParser
      .getObjectDefinations()
      .filter(o => this.isVariant(o))
      .map(o => {
        const objType = this.generateTypeDefination(o);
        this._model.addVariant(objType);
      });
  }

  private generateUnions() {
    this._schemaParser.getUnionTypes().map(u => {
      const types: string[] = [];
      u.getTypes().map(s => types.push(s.name));
      this._model.addUnion(u.name, types);
    });
  }

  private generateEnums() {
    this._schemaParser.getEnumTypes().map(e => this._model.addEnum(e));
  }

  // TODO: queries will be parsed from a top-level directive definition
  // and this part is going to be deprecated
  private genereateQueries() {
    const fts = new FTSDirective();
    const visitors: Visitors = {
      directives: {},
    };
    visitors.directives[FULL_TEXT_SEARCHABLE_DIRECTIVE] = {
      visit: (path: SchemaNode[]) => fts.generate(path, this._model),
    };
    this._schemaParser.dfsTraversal(visitors);
  }

  private postProcessFields() {
    while (this._fieldsToProcess) {
      const f = this._fieldsToProcess.pop();
      if (!f) return;
      f.modelType = this._model.lookupType(f.type);
    }
  }

  buildWarthogModel(): WarthogModel {
    this._model = new WarthogModel();

    this.generateEnums();
    this.generateInterfaces();
    this.generateVariants();
    this.generateUnions();
    this.generateEntities();
    this.postProcessFields();
    this.genereateQueries();

    DerivedFrom.validateDerivedFields(this._model);
    new RelationshipGenerator(this._model).generate();

    return this._model;
  }
}
