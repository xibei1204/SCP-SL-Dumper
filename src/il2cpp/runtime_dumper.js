'use strict';

const POINTER_SIZE = Process.pointerSize;
const CHUNK_LIMIT = 512 * 1024;
const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while'
]);

function exported(name, required = true) {
  const address = Module.findGlobalExportByName(name);
  if (address === null && required) throw new Error(`Missing IL2CPP export: ${name}`);
  return address;
}

function native(name, returnType, argumentTypes, required = true) {
  const address = exported(name, required);
  return address === null ? null : new NativeFunction(address, returnType, argumentTypes);
}

function readUtf8(value, fallback = '') {
  if (value === null || value.isNull()) return fallback;
  try {
    return value.readUtf8String() || fallback;
  } catch (_) {
    return fallback;
  }
}

function asNumber(value) {
  return typeof value === 'number' ? value : Number(value);
}

function identifier(value, fallback = '_') {
  let result = (value || fallback).replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(result)) result = `_${result}`;
  if (CSHARP_KEYWORDS.has(result)) result = `@${result}`;
  return result || fallback;
}

function namespaceName(value) {
  if (!value) return '';
  return value.split('.').map(part => identifier(part)).join('.');
}

function genericIdentifier(value) {
  const match = /^(.*)`(\d+)$/.exec(value || '');
  if (match === null) return identifier(value);
  const count = Number(match[2]);
  const parameters = [];
  for (let i = 0; i < count; i++) parameters.push(`T${i}`);
  return `${identifier(match[1])}<${parameters.join(', ')}>`;
}

function normalizeTypeName(value) {
  if (!value) return 'void';
  let result = value.replace(/[+/]/g, '.');
  result = result.replace(/`\d+(?=<)/g, '');
  result = result.replace(/`(\d+)/g, '_$1');
  return result;
}

function visibility(flags, nested) {
  const access = flags & 0x7;
  if (!nested) return access === 1 ? 'public' : 'internal';
  switch (access) {
    case 2: return 'public';
    case 3: return 'private';
    case 4: return 'protected';
    case 5: return 'internal';
    case 6: return 'private protected';
    case 7: return 'protected internal';
    default: return 'private';
  }
}

function memberVisibility(flags) {
  switch (flags & 0x7) {
    case 1: return 'private';
    case 2: return 'private protected';
    case 3: return 'internal';
    case 4: return 'protected';
    case 5: return 'protected internal';
    case 6: return 'public';
    default: return 'private';
  }
}

function createApi() {
  return {
    domainGet: native('il2cpp_domain_get', 'pointer', []),
    domainGetAssemblies: native('il2cpp_domain_get_assemblies', 'pointer', ['pointer', 'pointer']),
    threadAttach: native('il2cpp_thread_attach', 'pointer', ['pointer']),
    assemblyGetImage: native('il2cpp_assembly_get_image', 'pointer', ['pointer']),
    imageGetName: native('il2cpp_image_get_name', 'pointer', ['pointer']),
    imageGetClassCount: native('il2cpp_image_get_class_count', 'uint64', ['pointer']),
    imageGetClass: native('il2cpp_image_get_class', 'pointer', ['pointer', 'uint64']),
    classGetName: native('il2cpp_class_get_name', 'pointer', ['pointer']),
    classGetNamespace: native('il2cpp_class_get_namespace', 'pointer', ['pointer']),
    classGetFlags: native('il2cpp_class_get_flags', 'uint32', ['pointer']),
    classGetParent: native('il2cpp_class_get_parent', 'pointer', ['pointer']),
    classGetDeclaringType: native('il2cpp_class_get_declaring_type', 'pointer', ['pointer']),
    classGetType: native('il2cpp_class_get_type', 'pointer', ['pointer']),
    classGetInterfaces: native('il2cpp_class_get_interfaces', 'pointer', ['pointer', 'pointer']),
    classGetFields: native('il2cpp_class_get_fields', 'pointer', ['pointer', 'pointer']),
    classGetMethods: native('il2cpp_class_get_methods', 'pointer', ['pointer', 'pointer']),
    classGetProperties: native('il2cpp_class_get_properties', 'pointer', ['pointer', 'pointer']),
    classEnumBaseType: native('il2cpp_class_enum_basetype', 'pointer', ['pointer'], false),
    classIsEnum: native('il2cpp_class_is_enum', 'bool', ['pointer']),
    classIsValueType: native('il2cpp_class_is_valuetype', 'bool', ['pointer']),
    classIsInterface: native('il2cpp_class_is_interface', 'bool', ['pointer']),
    fieldGetName: native('il2cpp_field_get_name', 'pointer', ['pointer']),
    fieldGetType: native('il2cpp_field_get_type', 'pointer', ['pointer']),
    fieldGetFlags: native('il2cpp_field_get_flags', 'uint32', ['pointer']),
    fieldGetOffset: native('il2cpp_field_get_offset', 'uint64', ['pointer']),
    fieldStaticGetValue: native('il2cpp_field_static_get_value', 'void', ['pointer', 'pointer'], false),
    methodGetName: native('il2cpp_method_get_name', 'pointer', ['pointer']),
    methodGetReturnType: native('il2cpp_method_get_return_type', 'pointer', ['pointer']),
    methodGetParamCount: native('il2cpp_method_get_param_count', 'uint32', ['pointer']),
    methodGetParam: native('il2cpp_method_get_param', 'pointer', ['pointer', 'uint32']),
    methodGetParamName: native('il2cpp_method_get_param_name', 'pointer', ['pointer', 'uint32']),
    methodGetFlags: native('il2cpp_method_get_flags', 'uint32', ['pointer', 'pointer']),
    methodGetToken: native('il2cpp_method_get_token', 'uint32', ['pointer']),
    propertyGetName: native('il2cpp_property_get_name', 'pointer', ['pointer']),
    propertyGetGetMethod: native('il2cpp_property_get_get_method', 'pointer', ['pointer']),
    propertyGetSetMethod: native('il2cpp_property_get_set_method', 'pointer', ['pointer']),
    typeGetName: native('il2cpp_type_get_name', 'pointer', ['pointer'])
  };
}

function makeWriter() {
  let chunks = [];
  let length = 0;
  return {
    append(text) {
      chunks.push(text);
      length += text.length;
      if (length >= CHUNK_LIMIT) this.flush();
    },
    flush() {
      if (length === 0) return;
      send({ type: 'dump_chunk', text: chunks.join('') });
      chunks = [];
      length = 0;
    }
  };
}

function iterate(getNext, owner) {
  const iterator = Memory.alloc(POINTER_SIZE);
  iterator.writePointer(ptr(0));
  const values = [];
  while (true) {
    const value = getNext(owner, iterator);
    if (value.isNull()) break;
    values.push(value);
  }
  return values;
}

rpc.exports.dump = function () {
  const module = Process.findModuleByName('GameAssembly.dll');
  if (module === null) throw new Error('GameAssembly.dll is not loaded');

  const api = createApi();
  const typeCache = new Map();
  const typeName = type => {
    if (type === null || type.isNull()) return 'void';
    const key = type.toString();
    if (!typeCache.has(key)) typeCache.set(key, normalizeTypeName(readUtf8(api.typeGetName(type), 'void')));
    return typeCache.get(key);
  };
  const classTypeName = klass => klass.isNull() ? null : typeName(api.classGetType(klass));
  const enumValue = (klass, field) => {
    if (api.classEnumBaseType === null || api.fieldStaticGetValue === null) return null;
    const baseType = api.classEnumBaseType(klass);
    if (baseType.isNull()) return null;

    const storage = Memory.alloc(8);
    storage.writeU64(0);
    api.fieldStaticGetValue(field, storage);
    switch (typeName(baseType)) {
      case 'System.SByte': return storage.readS8().toString();
      case 'System.Byte': return storage.readU8().toString();
      case 'System.Int16': return storage.readS16().toString();
      case 'System.UInt16': return storage.readU16().toString();
      case 'System.UInt32': return storage.readU32().toString();
      case 'System.Int64': return storage.readS64().toString();
      case 'System.UInt64': return storage.readU64().toString();
      case 'System.Int32':
      default: return storage.readS32().toString();
    }
  };

  const domain = api.domainGet();
  if (domain.isNull()) throw new Error('IL2CPP domain is not initialized');
  api.threadAttach(domain);

  const assemblyCountPtr = Memory.alloc(POINTER_SIZE);
  assemblyCountPtr.writeU64(0);
  const assemblies = api.domainGetAssemblies(domain, assemblyCountPtr);
  const assemblyCount = asNumber(assemblyCountPtr.readU64());
  if (assemblies.isNull() || assemblyCount === 0) throw new Error('No IL2CPP assemblies were found');

  const images = [];
  let totalClasses = 0;
  for (let i = 0; i < assemblyCount; i++) {
    const assembly = assemblies.add(i * POINTER_SIZE).readPointer();
    const image = api.assemblyGetImage(assembly);
    if (image.isNull()) continue;
    const count = asNumber(api.imageGetClassCount(image));
    images.push({ image, name: readUtf8(api.imageGetName(image), `<image-${i}>`), count });
    totalClasses += count;
  }

  const writer = makeWriter();
  writer.append('// Generated by SCP_SL-Dumper runtime IL2CPP API backend.\n');
  writer.append(`// GameAssembly base: ${module.base}\n`);
  writer.append(`// Images: ${images.length}; Runtime classes: ${totalClasses}\n\n`);

  let classesDone = 0;
  let methodsDone = 0;
  let fieldsDone = 0;
  const reportProgress = imageName => {
    if (classesDone % 250 !== 0) return;
    writer.flush();
    send({ type: 'progress', classesDone, classesTotal: totalClasses, image: imageName });
  };

  for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
    const imageInfo = images[imageIndex];
    writer.append(`// Image ${imageIndex}: ${imageInfo.name}\n\n`);

    for (let classIndex = 0; classIndex < imageInfo.count; classIndex++) {
      const klass = api.imageGetClass(imageInfo.image, classIndex);
      if (klass.isNull()) continue;

      try {
        const rawName = readUtf8(api.classGetName(klass), `<class-${classIndex}>`);
        const className = genericIdentifier(rawName);
        const constructorName = identifier(rawName.replace(/`\d+$/, ''));
        const ns = namespaceName(readUtf8(api.classGetNamespace(klass)));
        const flags = api.classGetFlags(klass);
        const declaringType = api.classGetDeclaringType(klass);
        const isEnum = api.classIsEnum(klass);
        const isInterface = api.classIsInterface(klass);
        const isValueType = api.classIsValueType(klass);
        const isAbstract = (flags & 0x80) !== 0;
        const isSealed = (flags & 0x100) !== 0;

        writer.append(`// Namespace: ${ns || '<global>'}\n`);
        if (ns) writer.append(`namespace ${ns}\n{\n`);

        const indent = ns ? '    ' : '';
        const modifiers = [visibility(flags, !declaringType.isNull())];
        let kind = 'class';
        if (isEnum) kind = 'enum';
        else if (isInterface) kind = 'interface';
        else if (isValueType) kind = 'struct';
        else if (isAbstract && isSealed) modifiers.push('static');
        else {
          if (isAbstract) modifiers.push('abstract');
          if (isSealed) modifiers.push('sealed');
        }

        if (isEnum) {
          writer.append(`${indent}${modifiers.join(' ')} enum ${className} // RuntimeClassIndex: ${classIndex}\n`);
          writer.append(`${indent}{\n`);
          for (const field of iterate(api.classGetFields, klass)) {
            const fieldFlags = api.fieldGetFlags(field);
            if ((fieldFlags & 0x40) === 0) continue;
            const fieldName = identifier(readUtf8(api.fieldGetName(field), '_value'));
            let value = null;
            try {
              value = enumValue(klass, field);
            } catch (_) {
              value = null;
            }
            writer.append(`${indent}    ${fieldName}${value === null ? '' : ` = ${value}`},\n`);
            fieldsDone++;
          }
          writer.append(`${indent}}\n`);
          if (ns) writer.append('}\n');
          writer.append('\n');
          classesDone++;
          reportProgress(imageInfo.name);
          continue;
        }

        const bases = [];
        const parent = api.classGetParent(klass);
        if (!parent.isNull()) {
          const parentName = classTypeName(parent);
          if (parentName && parentName !== 'System.Object' && parentName !== 'System.ValueType') bases.push(parentName);
        }
        for (const iface of iterate(api.classGetInterfaces, klass)) {
          const ifaceName = classTypeName(iface);
          if (ifaceName) bases.push(ifaceName);
        }
        const inheritance = bases.length > 0 ? ` : ${Array.from(new Set(bases)).join(', ')}` : '';
        writer.append(`${indent}${modifiers.join(' ')} ${kind} ${className}${inheritance} // RuntimeClassIndex: ${classIndex}\n`);
        writer.append(`${indent}{\n`);

        const fields = iterate(api.classGetFields, klass);
        if (fields.length > 0) writer.append(`${indent}    // Fields\n`);
        for (const field of fields) {
          const fieldFlags = api.fieldGetFlags(field);
          const fieldModifiers = [memberVisibility(fieldFlags)];
          if ((fieldFlags & 0x10) !== 0) fieldModifiers.push('static');
          if ((fieldFlags & 0x20) !== 0) fieldModifiers.push('readonly');
          const literal = (fieldFlags & 0x40) !== 0;
          if (literal) {
            const staticIndex = fieldModifiers.indexOf('static');
            if (staticIndex >= 0) fieldModifiers.splice(staticIndex, 1);
            fieldModifiers.push('const');
          }
          const fieldName = identifier(readUtf8(api.fieldGetName(field), '_field'));
          const fieldType = typeName(api.fieldGetType(field));
          const offset = asNumber(api.fieldGetOffset(field));
          const initializer = literal ? ' = default' : '';
          writer.append(`${indent}    ${fieldModifiers.join(' ')} ${fieldType} ${fieldName}${initializer}; // 0x${offset.toString(16).toUpperCase()}\n`);
          fieldsDone++;
        }

        const properties = iterate(api.classGetProperties, klass);
        if (properties.length > 0) writer.append(`\n${indent}    // Properties\n`);
        for (const property of properties) {
          const getter = api.propertyGetGetMethod(property);
          const setter = api.propertyGetSetMethod(property);
          let propertyType = 'object';
          if (!getter.isNull()) propertyType = typeName(api.methodGetReturnType(getter));
          else if (!setter.isNull() && api.methodGetParamCount(setter) > 0) propertyType = typeName(api.methodGetParam(setter, 0));
          const propertyName = identifier(readUtf8(api.propertyGetName(property), '_property'));
          const accessors = `${getter.isNull() ? '' : 'get; '}${setter.isNull() ? '' : 'set; '}`;
          writer.append(`${indent}    public ${propertyType} ${propertyName} { ${accessors}}\n`);
        }

        const methods = iterate(api.classGetMethods, klass);
        if (methods.length > 0) writer.append(`\n${indent}    // Methods\n`);
        for (const method of methods) {
          const rawMethodName = readUtf8(api.methodGetName(method), '_method');
          const methodFlags = api.methodGetFlags(method, ptr(0));
          const methodModifiers = [memberVisibility(methodFlags)];
          if ((methodFlags & 0x10) !== 0) methodModifiers.push('static');
          if ((methodFlags & 0x40) !== 0) methodModifiers.push('virtual');
          if ((methodFlags & 0x400) !== 0) methodModifiers.push('abstract');
          const methodPointer = method.readPointer();
          let offsetComment = '// RVA: -1';
          if (!methodPointer.isNull() && methodPointer.compare(module.base) >= 0 && methodPointer.compare(module.base.add(module.size)) < 0) {
            offsetComment = `// RVA: 0x${methodPointer.sub(module.base).toString(16).toUpperCase()} VA: ${methodPointer}`;
          }
          const token = api.methodGetToken(method);
          writer.append(`${indent}    ${offsetComment} Token: 0x${token.toString(16).toUpperCase().padStart(8, '0')}\n`);

          const parameterCount = api.methodGetParamCount(method);
          const parameters = [];
          for (let parameterIndex = 0; parameterIndex < parameterCount; parameterIndex++) {
            let parameterType = typeName(api.methodGetParam(method, parameterIndex));
            let prefix = '';
            if (parameterType.endsWith('&')) {
              parameterType = parameterType.slice(0, -1);
              prefix = 'ref ';
            }
            const parameterName = identifier(readUtf8(api.methodGetParamName(method, parameterIndex), `param${parameterIndex}`));
            parameters.push(`${prefix}${parameterType} ${parameterName}`);
          }

          const abstractMethod = (methodFlags & 0x400) !== 0 || isInterface;
          if (rawMethodName === '.ctor') {
            writer.append(`${indent}    ${methodModifiers.join(' ')} ${constructorName}(${parameters.join(', ')})${abstractMethod ? ';' : ' { }'}\n`);
          } else if (rawMethodName === '.cctor') {
            writer.append(`${indent}    static ${constructorName}() { }\n`);
          } else {
            const returnType = typeName(api.methodGetReturnType(method));
            const methodName = genericIdentifier(rawMethodName);
            writer.append(`${indent}    ${methodModifiers.join(' ')} ${returnType} ${methodName}(${parameters.join(', ')})${abstractMethod ? ';' : ' { }'}\n`);
          }
          methodsDone++;
        }

        writer.append(`${indent}}\n`);
        if (ns) writer.append('}\n');
        writer.append('\n');
      } catch (error) {
        send({ type: 'warning', message: `${imageInfo.name} class ${classIndex}: ${error.stack || error}` });
      }

      classesDone++;
      reportProgress(imageInfo.name);
    }
  }

  writer.flush();
  send({ type: 'progress', classesDone, classesTotal: totalClasses, image: '<complete>' });
  return {
    images: images.length,
    classes: classesDone,
    fields: fieldsDone,
    methods: methodsDone,
    gameAssemblyBase: module.base.toString(),
    gameAssemblySize: module.size
  };
};
