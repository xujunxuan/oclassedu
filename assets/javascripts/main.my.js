/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                    hasProp(waiting, depName) ||
                    hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                    cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define("vendor/almond", function(){});

/*
 json2.js
 2014-02-04

 Public Domain.

 NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

 See http://www.JSON.org/js.html


 This code should be minified before deployment.
 See http://javascript.crockford.com/jsmin.html

 USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
 NOT CONTROL.


 This file creates a global JSON object containing two methods: stringify
 and parse.

 JSON.stringify(value, replacer, space)
 value       any JavaScript value, usually an object or array.

 replacer    an optional parameter that determines how object
 values are stringified for objects. It can be a
 function or an array of strings.

 space       an optional parameter that specifies the indentation
 of nested structures. If it is omitted, the text will
 be packed without extra whitespace. If it is a number,
 it will specify the number of spaces to indent at each
 level. If it is a string (such as '\t' or '&nbsp;'),
 it contains the characters used to indent at each level.

 This method produces a JSON text from a JavaScript value.

 When an object value is found, if the object contains a toJSON
 method, its toJSON method will be called and the result will be
 stringified. A toJSON method does not serialize: it returns the
 value represented by the name/value pair that should be serialized,
 or undefined if nothing should be serialized. The toJSON method
 will be passed the key associated with the value, and this will be
 bound to the value

 For example, this would serialize Dates as ISO strings.

 Date.prototype.toJSON = function (key) {
 function f(n) {
 // Format integers to have at least two digits.
 return n < 10 ? '0' + n : n;
 }

 return this.getUTCFullYear()   + '-' +
 f(this.getUTCMonth() + 1) + '-' +
 f(this.getUTCDate())      + 'T' +
 f(this.getUTCHours())     + ':' +
 f(this.getUTCMinutes())   + ':' +
 f(this.getUTCSeconds())   + 'Z';
 };

 You can provide an optional replacer method. It will be passed the
 key and value of each member, with this bound to the containing
 object. The value that is returned from your method will be
 serialized. If your method returns undefined, then the member will
 be excluded from the serialization.

 If the replacer parameter is an array of strings, then it will be
 used to select the members to be serialized. It filters the results
 such that only members with keys listed in the replacer array are
 stringified.

 Values that do not have JSON representations, such as undefined or
 functions, will not be serialized. Such values in objects will be
 dropped; in arrays they will be replaced with null. You can use
 a replacer function to replace those with JSON values.
 JSON.stringify(undefined) returns undefined.

 The optional space parameter produces a stringification of the
 value that is filled with line breaks and indentation to make it
 easier to read.

 If the space parameter is a non-empty string, then that string will
 be used for indentation. If the space parameter is a number, then
 the indentation will be that many spaces.

 Example:

 text = JSON.stringify(['e', {pluribus: 'unum'}]);
 // text is '["e",{"pluribus":"unum"}]'


 text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
 // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

 text = JSON.stringify([new Date()], function (key, value) {
 return this[key] instanceof Date ?
 'Date(' + this[key] + ')' : value;
 });
 // text is '["Date(---current time---)"]'


 JSON.parse(text, reviver)
 This method parses a JSON text to produce an object or array.
 It can throw a SyntaxError exception.

 The optional reviver parameter is a function that can filter and
 transform the results. It receives each of the keys and values,
 and its return value is used instead of the original value.
 If it returns what it received, then the structure is not modified.
 If it returns undefined then the member is deleted.

 Example:

 // Parse the text. Values that look like ISO date strings will
 // be converted to Date objects.

 myData = JSON.parse(text, function (key, value) {
 var a;
 if (typeof value === 'string') {
 a =
 /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
 if (a) {
 return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
 +a[5], +a[6]));
 }
 }
 return value;
 });

 myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
 var d;
 if (typeof value === 'string' &&
 value.slice(0, 5) === 'Date(' &&
 value.slice(-1) === ')') {
 d = new Date(value.slice(5, -1));
 if (d) {
 return d;
 }
 }
 return value;
 });


 This is a reference implementation. You are free to copy, modify, or
 redistribute.
 */

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
 call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
 getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
 lastIndex, length, parse, prototype, push, replace, slice, stringify,
 test, toJSON, toString, valueOf
 */


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

if (typeof JSON !== 'object') {
    JSON = {};
}

(function () {
    

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                f(this.getUTCMonth() + 1) + '-' +
                f(this.getUTCDate())      + 'T' +
                f(this.getUTCHours())     + ':' +
                f(this.getUTCMinutes())   + ':' +
                f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
                Boolean.prototype.toJSON = function () {
                    return this.valueOf();
                };
    }

    var cx,
        escapable,
        gap,
        indent,
        meta,
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
            typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
            case 'string':
                return quote(value);

            case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

                return isFinite(value) ? String(value) : 'null';

            case 'boolean':
            case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

                return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

            case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

                if (!value) {
                    return 'null';
                }

// Make an array to hold the partial results of stringifying this object value.

                gap += indent;
                partial = [];

// Is the value an array?

                if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                    length = value.length;
                    for (i = 0; i < length; i += 1) {
                        partial[i] = str(i, value) || 'null';
                    }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                    v = partial.length === 0
                        ? '[]'
                        : gap
                        ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                        : '[' + partial.join(',') + ']';
                    gap = mind;
                    return v;
                }

// If the replacer is an array, use it to select the members to be stringified.

                if (rep && typeof rep === 'object') {
                    length = rep.length;
                    for (i = 0; i < length; i += 1) {
                        if (typeof rep[i] === 'string') {
                            k = rep[i];
                            v = str(k, value);
                            if (v) {
                                partial.push(quote(k) + (gap ? ': ' : ':') + v);
                            }
                        }
                    }
                } else {

// Otherwise, iterate through all of the keys in the object.

                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = str(k, value);
                            if (v) {
                                partial.push(quote(k) + (gap ? ': ' : ':') + v);
                            }
                        }
                    }
                }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

                v = partial.length === 0
                    ? '{}'
                    : gap
                    ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                    : '{' + partial.join(',') + '}';
                gap = mind;
                return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                (typeof replacer !== 'object' ||
                    typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                    .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());
define("json", function(){});

//     Underscore.js 1.8.3
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.
(function(){function n(n){function t(t,r,e,u,i,o){for(;i>=0&&o>i;i+=n){var a=u?u[i]:i;e=r(e,t[a],a,t)}return e}return function(r,e,u,i){e=b(e,i,4);var o=!k(r)&&m.keys(r),a=(o||r).length,c=n>0?0:a-1;return arguments.length<3&&(u=r[o?o[c]:c],c+=n),t(r,e,u,o,c,a)}}function t(n){return function(t,r,e){r=x(r,e);for(var u=O(t),i=n>0?0:u-1;i>=0&&u>i;i+=n)if(r(t[i],i,t))return i;return-1}}function r(n,t,r){return function(e,u,i){var o=0,a=O(e);if("number"==typeof i)n>0?o=i>=0?i:Math.max(i+a,o):a=i>=0?Math.min(i+1,a):i+a+1;else if(r&&i&&a)return i=r(e,u),e[i]===u?i:-1;if(u!==u)return i=t(l.call(e,o,a),m.isNaN),i>=0?i+o:-1;for(i=n>0?o:a-1;i>=0&&a>i;i+=n)if(e[i]===u)return i;return-1}}function e(n,t){var r=I.length,e=n.constructor,u=m.isFunction(e)&&e.prototype||a,i="constructor";for(m.has(n,i)&&!m.contains(t,i)&&t.push(i);r--;)i=I[r],i in n&&n[i]!==u[i]&&!m.contains(t,i)&&t.push(i)}var u=this,i=u._,o=Array.prototype,a=Object.prototype,c=Function.prototype,f=o.push,l=o.slice,s=a.toString,p=a.hasOwnProperty,h=Array.isArray,v=Object.keys,g=c.bind,y=Object.create,d=function(){},m=function(n){return n instanceof m?n:this instanceof m?void(this._wrapped=n):new m(n)};"undefined"!=typeof exports?("undefined"!=typeof module&&module.exports&&(exports=module.exports=m),exports._=m):u._=m,m.VERSION="1.8.3";var b=function(n,t,r){if(t===void 0)return n;switch(null==r?3:r){case 1:return function(r){return n.call(t,r)};case 2:return function(r,e){return n.call(t,r,e)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)}}return function(){return n.apply(t,arguments)}},x=function(n,t,r){return null==n?m.identity:m.isFunction(n)?b(n,t,r):m.isObject(n)?m.matcher(n):m.property(n)};m.iteratee=function(n,t){return x(n,t,1/0)};var _=function(n,t){return function(r){var e=arguments.length;if(2>e||null==r)return r;for(var u=1;e>u;u++)for(var i=arguments[u],o=n(i),a=o.length,c=0;a>c;c++){var f=o[c];t&&r[f]!==void 0||(r[f]=i[f])}return r}},j=function(n){if(!m.isObject(n))return{};if(y)return y(n);d.prototype=n;var t=new d;return d.prototype=null,t},w=function(n){return function(t){return null==t?void 0:t[n]}},A=Math.pow(2,53)-1,O=w("length"),k=function(n){var t=O(n);return"number"==typeof t&&t>=0&&A>=t};m.each=m.forEach=function(n,t,r){t=b(t,r);var e,u;if(k(n))for(e=0,u=n.length;u>e;e++)t(n[e],e,n);else{var i=m.keys(n);for(e=0,u=i.length;u>e;e++)t(n[i[e]],i[e],n)}return n},m.map=m.collect=function(n,t,r){t=x(t,r);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=Array(u),o=0;u>o;o++){var a=e?e[o]:o;i[o]=t(n[a],a,n)}return i},m.reduce=m.foldl=m.inject=n(1),m.reduceRight=m.foldr=n(-1),m.find=m.detect=function(n,t,r){var e;return e=k(n)?m.findIndex(n,t,r):m.findKey(n,t,r),e!==void 0&&e!==-1?n[e]:void 0},m.filter=m.select=function(n,t,r){var e=[];return t=x(t,r),m.each(n,function(n,r,u){t(n,r,u)&&e.push(n)}),e},m.reject=function(n,t,r){return m.filter(n,m.negate(x(t)),r)},m.every=m.all=function(n,t,r){t=x(t,r);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=0;u>i;i++){var o=e?e[i]:i;if(!t(n[o],o,n))return!1}return!0},m.some=m.any=function(n,t,r){t=x(t,r);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=0;u>i;i++){var o=e?e[i]:i;if(t(n[o],o,n))return!0}return!1},m.contains=m.includes=m.include=function(n,t,r,e){return k(n)||(n=m.values(n)),("number"!=typeof r||e)&&(r=0),m.indexOf(n,t,r)>=0},m.invoke=function(n,t){var r=l.call(arguments,2),e=m.isFunction(t);return m.map(n,function(n){var u=e?t:n[t];return null==u?u:u.apply(n,r)})},m.pluck=function(n,t){return m.map(n,m.property(t))},m.where=function(n,t){return m.filter(n,m.matcher(t))},m.findWhere=function(n,t){return m.find(n,m.matcher(t))},m.max=function(n,t,r){var e,u,i=-1/0,o=-1/0;if(null==t&&null!=n){n=k(n)?n:m.values(n);for(var a=0,c=n.length;c>a;a++)e=n[a],e>i&&(i=e)}else t=x(t,r),m.each(n,function(n,r,e){u=t(n,r,e),(u>o||u===-1/0&&i===-1/0)&&(i=n,o=u)});return i},m.min=function(n,t,r){var e,u,i=1/0,o=1/0;if(null==t&&null!=n){n=k(n)?n:m.values(n);for(var a=0,c=n.length;c>a;a++)e=n[a],i>e&&(i=e)}else t=x(t,r),m.each(n,function(n,r,e){u=t(n,r,e),(o>u||1/0===u&&1/0===i)&&(i=n,o=u)});return i},m.shuffle=function(n){for(var t,r=k(n)?n:m.values(n),e=r.length,u=Array(e),i=0;e>i;i++)t=m.random(0,i),t!==i&&(u[i]=u[t]),u[t]=r[i];return u},m.sample=function(n,t,r){return null==t||r?(k(n)||(n=m.values(n)),n[m.random(n.length-1)]):m.shuffle(n).slice(0,Math.max(0,t))},m.sortBy=function(n,t,r){return t=x(t,r),m.pluck(m.map(n,function(n,r,e){return{value:n,index:r,criteria:t(n,r,e)}}).sort(function(n,t){var r=n.criteria,e=t.criteria;if(r!==e){if(r>e||r===void 0)return 1;if(e>r||e===void 0)return-1}return n.index-t.index}),"value")};var F=function(n){return function(t,r,e){var u={};return r=x(r,e),m.each(t,function(e,i){var o=r(e,i,t);n(u,e,o)}),u}};m.groupBy=F(function(n,t,r){m.has(n,r)?n[r].push(t):n[r]=[t]}),m.indexBy=F(function(n,t,r){n[r]=t}),m.countBy=F(function(n,t,r){m.has(n,r)?n[r]++:n[r]=1}),m.toArray=function(n){return n?m.isArray(n)?l.call(n):k(n)?m.map(n,m.identity):m.values(n):[]},m.size=function(n){return null==n?0:k(n)?n.length:m.keys(n).length},m.partition=function(n,t,r){t=x(t,r);var e=[],u=[];return m.each(n,function(n,r,i){(t(n,r,i)?e:u).push(n)}),[e,u]},m.first=m.head=m.take=function(n,t,r){return null==n?void 0:null==t||r?n[0]:m.initial(n,n.length-t)},m.initial=function(n,t,r){return l.call(n,0,Math.max(0,n.length-(null==t||r?1:t)))},m.last=function(n,t,r){return null==n?void 0:null==t||r?n[n.length-1]:m.rest(n,Math.max(0,n.length-t))},m.rest=m.tail=m.drop=function(n,t,r){return l.call(n,null==t||r?1:t)},m.compact=function(n){return m.filter(n,m.identity)};var S=function(n,t,r,e){for(var u=[],i=0,o=e||0,a=O(n);a>o;o++){var c=n[o];if(k(c)&&(m.isArray(c)||m.isArguments(c))){t||(c=S(c,t,r));var f=0,l=c.length;for(u.length+=l;l>f;)u[i++]=c[f++]}else r||(u[i++]=c)}return u};m.flatten=function(n,t){return S(n,t,!1)},m.without=function(n){return m.difference(n,l.call(arguments,1))},m.uniq=m.unique=function(n,t,r,e){m.isBoolean(t)||(e=r,r=t,t=!1),null!=r&&(r=x(r,e));for(var u=[],i=[],o=0,a=O(n);a>o;o++){var c=n[o],f=r?r(c,o,n):c;t?(o&&i===f||u.push(c),i=f):r?m.contains(i,f)||(i.push(f),u.push(c)):m.contains(u,c)||u.push(c)}return u},m.union=function(){return m.uniq(S(arguments,!0,!0))},m.intersection=function(n){for(var t=[],r=arguments.length,e=0,u=O(n);u>e;e++){var i=n[e];if(!m.contains(t,i)){for(var o=1;r>o&&m.contains(arguments[o],i);o++);o===r&&t.push(i)}}return t},m.difference=function(n){var t=S(arguments,!0,!0,1);return m.filter(n,function(n){return!m.contains(t,n)})},m.zip=function(){return m.unzip(arguments)},m.unzip=function(n){for(var t=n&&m.max(n,O).length||0,r=Array(t),e=0;t>e;e++)r[e]=m.pluck(n,e);return r},m.object=function(n,t){for(var r={},e=0,u=O(n);u>e;e++)t?r[n[e]]=t[e]:r[n[e][0]]=n[e][1];return r},m.findIndex=t(1),m.findLastIndex=t(-1),m.sortedIndex=function(n,t,r,e){r=x(r,e,1);for(var u=r(t),i=0,o=O(n);o>i;){var a=Math.floor((i+o)/2);r(n[a])<u?i=a+1:o=a}return i},m.indexOf=r(1,m.findIndex,m.sortedIndex),m.lastIndexOf=r(-1,m.findLastIndex),m.range=function(n,t,r){null==t&&(t=n||0,n=0),r=r||1;for(var e=Math.max(Math.ceil((t-n)/r),0),u=Array(e),i=0;e>i;i++,n+=r)u[i]=n;return u};var E=function(n,t,r,e,u){if(!(e instanceof t))return n.apply(r,u);var i=j(n.prototype),o=n.apply(i,u);return m.isObject(o)?o:i};m.bind=function(n,t){if(g&&n.bind===g)return g.apply(n,l.call(arguments,1));if(!m.isFunction(n))throw new TypeError("Bind must be called on a function");var r=l.call(arguments,2),e=function(){return E(n,e,t,this,r.concat(l.call(arguments)))};return e},m.partial=function(n){var t=l.call(arguments,1),r=function(){for(var e=0,u=t.length,i=Array(u),o=0;u>o;o++)i[o]=t[o]===m?arguments[e++]:t[o];for(;e<arguments.length;)i.push(arguments[e++]);return E(n,r,this,this,i)};return r},m.bindAll=function(n){var t,r,e=arguments.length;if(1>=e)throw new Error("bindAll must be passed function names");for(t=1;e>t;t++)r=arguments[t],n[r]=m.bind(n[r],n);return n},m.memoize=function(n,t){var r=function(e){var u=r.cache,i=""+(t?t.apply(this,arguments):e);return m.has(u,i)||(u[i]=n.apply(this,arguments)),u[i]};return r.cache={},r},m.delay=function(n,t){var r=l.call(arguments,2);return setTimeout(function(){return n.apply(null,r)},t)},m.defer=m.partial(m.delay,m,1),m.throttle=function(n,t,r){var e,u,i,o=null,a=0;r||(r={});var c=function(){a=r.leading===!1?0:m.now(),o=null,i=n.apply(e,u),o||(e=u=null)};return function(){var f=m.now();a||r.leading!==!1||(a=f);var l=t-(f-a);return e=this,u=arguments,0>=l||l>t?(o&&(clearTimeout(o),o=null),a=f,i=n.apply(e,u),o||(e=u=null)):o||r.trailing===!1||(o=setTimeout(c,l)),i}},m.debounce=function(n,t,r){var e,u,i,o,a,c=function(){var f=m.now()-o;t>f&&f>=0?e=setTimeout(c,t-f):(e=null,r||(a=n.apply(i,u),e||(i=u=null)))};return function(){i=this,u=arguments,o=m.now();var f=r&&!e;return e||(e=setTimeout(c,t)),f&&(a=n.apply(i,u),i=u=null),a}},m.wrap=function(n,t){return m.partial(t,n)},m.negate=function(n){return function(){return!n.apply(this,arguments)}},m.compose=function(){var n=arguments,t=n.length-1;return function(){for(var r=t,e=n[t].apply(this,arguments);r--;)e=n[r].call(this,e);return e}},m.after=function(n,t){return function(){return--n<1?t.apply(this,arguments):void 0}},m.before=function(n,t){var r;return function(){return--n>0&&(r=t.apply(this,arguments)),1>=n&&(t=null),r}},m.once=m.partial(m.before,2);var M=!{toString:null}.propertyIsEnumerable("toString"),I=["valueOf","isPrototypeOf","toString","propertyIsEnumerable","hasOwnProperty","toLocaleString"];m.keys=function(n){if(!m.isObject(n))return[];if(v)return v(n);var t=[];for(var r in n)m.has(n,r)&&t.push(r);return M&&e(n,t),t},m.allKeys=function(n){if(!m.isObject(n))return[];var t=[];for(var r in n)t.push(r);return M&&e(n,t),t},m.values=function(n){for(var t=m.keys(n),r=t.length,e=Array(r),u=0;r>u;u++)e[u]=n[t[u]];return e},m.mapObject=function(n,t,r){t=x(t,r);for(var e,u=m.keys(n),i=u.length,o={},a=0;i>a;a++)e=u[a],o[e]=t(n[e],e,n);return o},m.pairs=function(n){for(var t=m.keys(n),r=t.length,e=Array(r),u=0;r>u;u++)e[u]=[t[u],n[t[u]]];return e},m.invert=function(n){for(var t={},r=m.keys(n),e=0,u=r.length;u>e;e++)t[n[r[e]]]=r[e];return t},m.functions=m.methods=function(n){var t=[];for(var r in n)m.isFunction(n[r])&&t.push(r);return t.sort()},m.extend=_(m.allKeys),m.extendOwn=m.assign=_(m.keys),m.findKey=function(n,t,r){t=x(t,r);for(var e,u=m.keys(n),i=0,o=u.length;o>i;i++)if(e=u[i],t(n[e],e,n))return e},m.pick=function(n,t,r){var e,u,i={},o=n;if(null==o)return i;m.isFunction(t)?(u=m.allKeys(o),e=b(t,r)):(u=S(arguments,!1,!1,1),e=function(n,t,r){return t in r},o=Object(o));for(var a=0,c=u.length;c>a;a++){var f=u[a],l=o[f];e(l,f,o)&&(i[f]=l)}return i},m.omit=function(n,t,r){if(m.isFunction(t))t=m.negate(t);else{var e=m.map(S(arguments,!1,!1,1),String);t=function(n,t){return!m.contains(e,t)}}return m.pick(n,t,r)},m.defaults=_(m.allKeys,!0),m.create=function(n,t){var r=j(n);return t&&m.extendOwn(r,t),r},m.clone=function(n){return m.isObject(n)?m.isArray(n)?n.slice():m.extend({},n):n},m.tap=function(n,t){return t(n),n},m.isMatch=function(n,t){var r=m.keys(t),e=r.length;if(null==n)return!e;for(var u=Object(n),i=0;e>i;i++){var o=r[i];if(t[o]!==u[o]||!(o in u))return!1}return!0};var N=function(n,t,r,e){if(n===t)return 0!==n||1/n===1/t;if(null==n||null==t)return n===t;n instanceof m&&(n=n._wrapped),t instanceof m&&(t=t._wrapped);var u=s.call(n);if(u!==s.call(t))return!1;switch(u){case"[object RegExp]":case"[object String]":return""+n==""+t;case"[object Number]":return+n!==+n?+t!==+t:0===+n?1/+n===1/t:+n===+t;case"[object Date]":case"[object Boolean]":return+n===+t}var i="[object Array]"===u;if(!i){if("object"!=typeof n||"object"!=typeof t)return!1;var o=n.constructor,a=t.constructor;if(o!==a&&!(m.isFunction(o)&&o instanceof o&&m.isFunction(a)&&a instanceof a)&&"constructor"in n&&"constructor"in t)return!1}r=r||[],e=e||[];for(var c=r.length;c--;)if(r[c]===n)return e[c]===t;if(r.push(n),e.push(t),i){if(c=n.length,c!==t.length)return!1;for(;c--;)if(!N(n[c],t[c],r,e))return!1}else{var f,l=m.keys(n);if(c=l.length,m.keys(t).length!==c)return!1;for(;c--;)if(f=l[c],!m.has(t,f)||!N(n[f],t[f],r,e))return!1}return r.pop(),e.pop(),!0};m.isEqual=function(n,t){return N(n,t)},m.isEmpty=function(n){return null==n?!0:k(n)&&(m.isArray(n)||m.isString(n)||m.isArguments(n))?0===n.length:0===m.keys(n).length},m.isElement=function(n){return!(!n||1!==n.nodeType)},m.isArray=h||function(n){return"[object Array]"===s.call(n)},m.isObject=function(n){var t=typeof n;return"function"===t||"object"===t&&!!n},m.each(["Arguments","Function","String","Number","Date","RegExp","Error"],function(n){m["is"+n]=function(t){return s.call(t)==="[object "+n+"]"}}),m.isArguments(arguments)||(m.isArguments=function(n){return m.has(n,"callee")}),"function"!=typeof/./&&"object"!=typeof Int8Array&&(m.isFunction=function(n){return"function"==typeof n||!1}),m.isFinite=function(n){return isFinite(n)&&!isNaN(parseFloat(n))},m.isNaN=function(n){return m.isNumber(n)&&n!==+n},m.isBoolean=function(n){return n===!0||n===!1||"[object Boolean]"===s.call(n)},m.isNull=function(n){return null===n},m.isUndefined=function(n){return n===void 0},m.has=function(n,t){return null!=n&&p.call(n,t)},m.noConflict=function(){return u._=i,this},m.identity=function(n){return n},m.constant=function(n){return function(){return n}},m.noop=function(){},m.property=w,m.propertyOf=function(n){return null==n?function(){}:function(t){return n[t]}},m.matcher=m.matches=function(n){return n=m.extendOwn({},n),function(t){return m.isMatch(t,n)}},m.times=function(n,t,r){var e=Array(Math.max(0,n));t=b(t,r,1);for(var u=0;n>u;u++)e[u]=t(u);return e},m.random=function(n,t){return null==t&&(t=n,n=0),n+Math.floor(Math.random()*(t-n+1))},m.now=Date.now||function(){return(new Date).getTime()};var B={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"},T=m.invert(B),R=function(n){var t=function(t){return n[t]},r="(?:"+m.keys(n).join("|")+")",e=RegExp(r),u=RegExp(r,"g");return function(n){return n=null==n?"":""+n,e.test(n)?n.replace(u,t):n}};m.escape=R(B),m.unescape=R(T),m.result=function(n,t,r){var e=null==n?void 0:n[t];return e===void 0&&(e=r),m.isFunction(e)?e.call(n):e};var q=0;m.uniqueId=function(n){var t=++q+"";return n?n+t:t},m.templateSettings={evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,escape:/<%-([\s\S]+?)%>/g};var K=/(.)^/,z={"'":"'","\\":"\\","\r":"r","\n":"n","\u2028":"u2028","\u2029":"u2029"},D=/\\|'|\r|\n|\u2028|\u2029/g,L=function(n){return"\\"+z[n]};m.template=function(n,t,r){!t&&r&&(t=r),t=m.defaults({},t,m.templateSettings);var e=RegExp([(t.escape||K).source,(t.interpolate||K).source,(t.evaluate||K).source].join("|")+"|$","g"),u=0,i="__p+='";n.replace(e,function(t,r,e,o,a){return i+=n.slice(u,a).replace(D,L),u=a+t.length,r?i+="'+\n((__t=("+r+"))==null?'':_.escape(__t))+\n'":e?i+="'+\n((__t=("+e+"))==null?'':__t)+\n'":o&&(i+="';\n"+o+"\n__p+='"),t}),i+="';\n",t.variable||(i="with(obj||{}){\n"+i+"}\n"),i="var __t,__p='',__j=Array.prototype.join,"+"print=function(){__p+=__j.call(arguments,'');};\n"+i+"return __p;\n";try{var o=new Function(t.variable||"obj","_",i)}catch(a){throw a.source=i,a}var c=function(n){return o.call(this,n,m)},f=t.variable||"obj";return c.source="function("+f+"){\n"+i+"}",c},m.chain=function(n){var t=m(n);return t._chain=!0,t};var P=function(n,t){return n._chain?m(t).chain():t};m.mixin=function(n){m.each(m.functions(n),function(t){var r=m[t]=n[t];m.prototype[t]=function(){var n=[this._wrapped];return f.apply(n,arguments),P(this,r.apply(m,n))}})},m.mixin(m),m.each(["pop","push","reverse","shift","sort","splice","unshift"],function(n){var t=o[n];m.prototype[n]=function(){var r=this._wrapped;return t.apply(r,arguments),"shift"!==n&&"splice"!==n||0!==r.length||delete r[0],P(this,r)}}),m.each(["concat","join","slice"],function(n){var t=o[n];m.prototype[n]=function(){return P(this,t.apply(this._wrapped,arguments))}}),m.prototype.value=function(){return this._wrapped},m.prototype.valueOf=m.prototype.toJSON=m.prototype.value,m.prototype.toString=function(){return""+this._wrapped},"function"==typeof define&&define.amd&&define("underscore",[],function(){return m})}).call(this);

/*! jQuery v1.11.3 | (c) 2005, 2015 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l="1.11.3",m=function(a,b){return new m.fn.init(a,b)},n=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,o=/^-ms-/,p=/-([\da-z])/gi,q=function(a,b){return b.toUpperCase()};m.fn=m.prototype={jquery:l,constructor:m,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=m.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return m.each(this,a,b)},map:function(a){return this.pushStack(m.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},m.extend=m.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||m.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(e=arguments[h]))for(d in e)a=g[d],c=e[d],g!==c&&(j&&c&&(m.isPlainObject(c)||(b=m.isArray(c)))?(b?(b=!1,f=a&&m.isArray(a)?a:[]):f=a&&m.isPlainObject(a)?a:{},g[d]=m.extend(j,f,c)):void 0!==c&&(g[d]=c));return g},m.extend({expando:"jQuery"+(l+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===m.type(a)},isArray:Array.isArray||function(a){return"array"===m.type(a)},isWindow:function(a){return null!=a&&a==a.window},isNumeric:function(a){return!m.isArray(a)&&a-parseFloat(a)+1>=0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},isPlainObject:function(a){var b;if(!a||"object"!==m.type(a)||a.nodeType||m.isWindow(a))return!1;try{if(a.constructor&&!j.call(a,"constructor")&&!j.call(a.constructor.prototype,"isPrototypeOf"))return!1}catch(c){return!1}if(k.ownLast)for(b in a)return j.call(a,b);for(b in a);return void 0===b||j.call(a,b)},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(b){b&&m.trim(b)&&(a.execScript||function(b){a.eval.call(a,b)})(b)},camelCase:function(a){return a.replace(o,"ms-").replace(p,q)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=r(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(n,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(r(Object(a))?m.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){var d;if(b){if(g)return g.call(b,a,c);for(d=b.length,c=c?0>c?Math.max(0,d+c):c:0;d>c;c++)if(c in b&&b[c]===a)return c}return-1},merge:function(a,b){var c=+b.length,d=0,e=a.length;while(c>d)a[e++]=b[d++];if(c!==c)while(void 0!==b[d])a[e++]=b[d++];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=r(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(f=a[b],b=a,a=f),m.isFunction(a)?(c=d.call(arguments,2),e=function(){return a.apply(b||this,c.concat(d.call(arguments)))},e.guid=a.guid=a.guid||m.guid++,e):void 0},now:function(){return+new Date},support:k}),m.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function r(a){var b="length"in a&&a.length,c=m.type(a);return"function"===c||m.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var s=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ha(),z=ha(),A=ha(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N=M.replace("w","w#"),O="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+N+"))|)"+L+"*\\]",P=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+O+")*)|.*)\\)|)",Q=new RegExp(L+"+","g"),R=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),S=new RegExp("^"+L+"*,"+L+"*"),T=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),U=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),V=new RegExp(P),W=new RegExp("^"+N+"$"),X={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M.replace("w","w*")+")"),ATTR:new RegExp("^"+O),PSEUDO:new RegExp("^"+P),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,aa=/[+~]/,ba=/'|\\/g,ca=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),da=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},ea=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(fa){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function ga(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],k=b.nodeType,"string"!=typeof a||!a||1!==k&&9!==k&&11!==k)return d;if(!e&&p){if(11!==k&&(f=_.exec(a)))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return H.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName)return H.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=1!==k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(ba,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+ra(o[l]);w=aa.test(a)&&pa(b.parentNode)||b,x=o.join(",")}if(x)try{return H.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function ha(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ia(a){return a[u]=!0,a}function ja(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ka(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function la(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function na(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function oa(a){return ia(function(b){return b=+b,ia(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function pa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=ga.support={},f=ga.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=ga.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=g.documentElement,e=g.defaultView,e&&e!==e.top&&(e.addEventListener?e.addEventListener("unload",ea,!1):e.attachEvent&&e.attachEvent("onunload",ea)),p=!f(g),c.attributes=ja(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ja(function(a){return a.appendChild(g.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(g.getElementsByClassName),c.getById=ja(function(a){return o.appendChild(a).id=u,!g.getElementsByName||!g.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(g.querySelectorAll))&&(ja(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\f]' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ja(function(a){var b=g.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ja(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",P)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===g||a.ownerDocument===v&&t(v,a)?-1:b===g||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,h=[a],i=[b];if(!e||!f)return a===g?-1:b===g?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return la(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?la(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},g):n},ga.matches=function(a,b){return ga(a,null,null,b)},ga.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return ga(b,n,null,[a]).length>0},ga.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},ga.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},ga.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},ga.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=ga.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=ga.selectors={cacheLength:50,createPseudo:ia,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(ca,da),a[3]=(a[3]||a[4]||a[5]||"").replace(ca,da),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||ga.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&ga.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(ca,da).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=ga.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(Q," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||ga.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ia(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ia(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?ia(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ia(function(a){return function(b){return ga(a,b).length>0}}),contains:ia(function(a){return a=a.replace(ca,da),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ia(function(a){return W.test(a||"")||ga.error("unsupported lang: "+a),a=a.replace(ca,da).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:oa(function(){return[0]}),last:oa(function(a,b){return[b-1]}),eq:oa(function(a,b,c){return[0>c?c+b:c]}),even:oa(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:oa(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:oa(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:oa(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=ma(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=na(b);function qa(){}qa.prototype=d.filters=d.pseudos,d.setFilters=new qa,g=ga.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?ga.error(a):z(a,i).slice(0)};function ra(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function sa(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function ta(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ua(a,b,c){for(var d=0,e=b.length;e>d;d++)ga(a,b[d],c);return c}function va(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function wa(a,b,c,d,e,f){return d&&!d[u]&&(d=wa(d)),e&&!e[u]&&(e=wa(e,f)),ia(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ua(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:va(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=va(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=va(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function xa(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=sa(function(a){return a===b},h,!0),l=sa(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[sa(ta(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return wa(i>1&&ta(m),i>1&&ra(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&xa(a.slice(i,e)),f>e&&xa(a=a.slice(e)),f>e&&ra(a))}m.push(c)}return ta(m)}function ya(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=F.call(i));s=va(s)}H.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&ga.uniqueSort(i)}return k&&(w=v,j=t),r};return c?ia(f):f}return h=ga.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=xa(b[c]),f[u]?d.push(f):e.push(f);f=A(a,ya(e,d)),f.selector=a}return f},i=ga.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(ca,da),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(ca,da),aa.test(j[0].type)&&pa(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&ra(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,aa.test(a)&&pa(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ja(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ja(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ka("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ja(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ka("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ja(function(a){return null==a.getAttribute("disabled")})||ka(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),ga}(a);m.find=s,m.expr=s.selectors,m.expr[":"]=m.expr.pseudos,m.unique=s.uniqueSort,m.text=s.getText,m.isXMLDoc=s.isXML,m.contains=s.contains;var t=m.expr.match.needsContext,u=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,v=/^.[^:#\[\.,]*$/;function w(a,b,c){if(m.isFunction(b))return m.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return m.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(v.test(b))return m.filter(b,a,c);b=m.filter(b,a)}return m.grep(a,function(a){return m.inArray(a,b)>=0!==c})}m.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?m.find.matchesSelector(d,a)?[d]:[]:m.find.matches(a,m.grep(b,function(a){return 1===a.nodeType}))},m.fn.extend({find:function(a){var b,c=[],d=this,e=d.length;if("string"!=typeof a)return this.pushStack(m(a).filter(function(){for(b=0;e>b;b++)if(m.contains(d[b],this))return!0}));for(b=0;e>b;b++)m.find(a,d[b],c);return c=this.pushStack(e>1?m.unique(c):c),c.selector=this.selector?this.selector+" "+a:a,c},filter:function(a){return this.pushStack(w(this,a||[],!1))},not:function(a){return this.pushStack(w(this,a||[],!0))},is:function(a){return!!w(this,"string"==typeof a&&t.test(a)?m(a):a||[],!1).length}});var x,y=a.document,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=m.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a.charAt(0)&&">"===a.charAt(a.length-1)&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||x).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof m?b[0]:b,m.merge(this,m.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:y,!0)),u.test(c[1])&&m.isPlainObject(b))for(c in b)m.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}if(d=y.getElementById(c[2]),d&&d.parentNode){if(d.id!==c[2])return x.find(a);this.length=1,this[0]=d}return this.context=y,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):m.isFunction(a)?"undefined"!=typeof x.ready?x.ready(a):a(m):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),m.makeArray(a,this))};A.prototype=m.fn,x=m(y);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};m.extend({dir:function(a,b,c){var d=[],e=a[b];while(e&&9!==e.nodeType&&(void 0===c||1!==e.nodeType||!m(e).is(c)))1===e.nodeType&&d.push(e),e=e[b];return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),m.fn.extend({has:function(a){var b,c=m(a,this),d=c.length;return this.filter(function(){for(b=0;d>b;b++)if(m.contains(this,c[b]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=t.test(a)||"string"!=typeof a?m(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&m.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?m.unique(f):f)},index:function(a){return a?"string"==typeof a?m.inArray(this[0],m(a)):m.inArray(a.jquery?a[0]:a,this):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(m.unique(m.merge(this.get(),m(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){do a=a[b];while(a&&1!==a.nodeType);return a}m.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return m.dir(a,"parentNode")},parentsUntil:function(a,b,c){return m.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return m.dir(a,"nextSibling")},prevAll:function(a){return m.dir(a,"previousSibling")},nextUntil:function(a,b,c){return m.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return m.dir(a,"previousSibling",c)},siblings:function(a){return m.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return m.sibling(a.firstChild)},contents:function(a){return m.nodeName(a,"iframe")?a.contentDocument||a.contentWindow.document:m.merge([],a.childNodes)}},function(a,b){m.fn[a]=function(c,d){var e=m.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=m.filter(d,e)),this.length>1&&(C[a]||(e=m.unique(e)),B.test(a)&&(e=e.reverse())),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return m.each(a.match(E)||[],function(a,c){b[c]=!0}),b}m.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):m.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(c=a.memory&&l,d=!0,f=g||0,g=0,e=h.length,b=!0;h&&e>f;f++)if(h[f].apply(l[0],l[1])===!1&&a.stopOnFalse){c=!1;break}b=!1,h&&(i?i.length&&j(i.shift()):c?h=[]:k.disable())},k={add:function(){if(h){var d=h.length;!function f(b){m.each(b,function(b,c){var d=m.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&f(c)})}(arguments),b?e=h.length:c&&(g=d,j(c))}return this},remove:function(){return h&&m.each(arguments,function(a,c){var d;while((d=m.inArray(c,h,d))>-1)h.splice(d,1),b&&(e>=d&&e--,f>=d&&f--)}),this},has:function(a){return a?m.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],e=0,this},disable:function(){return h=i=c=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,c||k.disable(),this},locked:function(){return!i},fireWith:function(a,c){return!h||d&&!i||(c=c||[],c=[a,c.slice?c.slice():c],b?i.push(c):j(c)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!d}};return k},m.extend({Deferred:function(a){var b=[["resolve","done",m.Callbacks("once memory"),"resolved"],["reject","fail",m.Callbacks("once memory"),"rejected"],["notify","progress",m.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return m.Deferred(function(c){m.each(b,function(b,f){var g=m.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&m.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?m.extend(a,d):d}},e={};return d.pipe=d.then,m.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&m.isFunction(a.promise)?e:0,g=1===f?a:m.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&m.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;m.fn.ready=function(a){return m.ready.promise().done(a),this},m.extend({isReady:!1,readyWait:1,holdReady:function(a){a?m.readyWait++:m.ready(!0)},ready:function(a){if(a===!0?!--m.readyWait:!m.isReady){if(!y.body)return setTimeout(m.ready);m.isReady=!0,a!==!0&&--m.readyWait>0||(H.resolveWith(y,[m]),m.fn.triggerHandler&&(m(y).triggerHandler("ready"),m(y).off("ready")))}}});function I(){y.addEventListener?(y.removeEventListener("DOMContentLoaded",J,!1),a.removeEventListener("load",J,!1)):(y.detachEvent("onreadystatechange",J),a.detachEvent("onload",J))}function J(){(y.addEventListener||"load"===event.type||"complete"===y.readyState)&&(I(),m.ready())}m.ready.promise=function(b){if(!H)if(H=m.Deferred(),"complete"===y.readyState)setTimeout(m.ready);else if(y.addEventListener)y.addEventListener("DOMContentLoaded",J,!1),a.addEventListener("load",J,!1);else{y.attachEvent("onreadystatechange",J),a.attachEvent("onload",J);var c=!1;try{c=null==a.frameElement&&y.documentElement}catch(d){}c&&c.doScroll&&!function e(){if(!m.isReady){try{c.doScroll("left")}catch(a){return setTimeout(e,50)}I(),m.ready()}}()}return H.promise(b)};var K="undefined",L;for(L in m(k))break;k.ownLast="0"!==L,k.inlineBlockNeedsLayout=!1,m(function(){var a,b,c,d;c=y.getElementsByTagName("body")[0],c&&c.style&&(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),typeof b.style.zoom!==K&&(b.style.cssText="display:inline;margin:0;border:0;padding:1px;width:1px;zoom:1",k.inlineBlockNeedsLayout=a=3===b.offsetWidth,a&&(c.style.zoom=1)),c.removeChild(d))}),function(){var a=y.createElement("div");if(null==k.deleteExpando){k.deleteExpando=!0;try{delete a.test}catch(b){k.deleteExpando=!1}}a=null}(),m.acceptData=function(a){var b=m.noData[(a.nodeName+" ").toLowerCase()],c=+a.nodeType||1;return 1!==c&&9!==c?!1:!b||b!==!0&&a.getAttribute("classid")===b};var M=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,N=/([A-Z])/g;function O(a,b,c){if(void 0===c&&1===a.nodeType){var d="data-"+b.replace(N,"-$1").toLowerCase();if(c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:M.test(c)?m.parseJSON(c):c}catch(e){}m.data(a,b,c)}else c=void 0}return c}function P(a){var b;for(b in a)if(("data"!==b||!m.isEmptyObject(a[b]))&&"toJSON"!==b)return!1;

return!0}function Q(a,b,d,e){if(m.acceptData(a)){var f,g,h=m.expando,i=a.nodeType,j=i?m.cache:a,k=i?a[h]:a[h]&&h;if(k&&j[k]&&(e||j[k].data)||void 0!==d||"string"!=typeof b)return k||(k=i?a[h]=c.pop()||m.guid++:h),j[k]||(j[k]=i?{}:{toJSON:m.noop}),("object"==typeof b||"function"==typeof b)&&(e?j[k]=m.extend(j[k],b):j[k].data=m.extend(j[k].data,b)),g=j[k],e||(g.data||(g.data={}),g=g.data),void 0!==d&&(g[m.camelCase(b)]=d),"string"==typeof b?(f=g[b],null==f&&(f=g[m.camelCase(b)])):f=g,f}}function R(a,b,c){if(m.acceptData(a)){var d,e,f=a.nodeType,g=f?m.cache:a,h=f?a[m.expando]:m.expando;if(g[h]){if(b&&(d=c?g[h]:g[h].data)){m.isArray(b)?b=b.concat(m.map(b,m.camelCase)):b in d?b=[b]:(b=m.camelCase(b),b=b in d?[b]:b.split(" ")),e=b.length;while(e--)delete d[b[e]];if(c?!P(d):!m.isEmptyObject(d))return}(c||(delete g[h].data,P(g[h])))&&(f?m.cleanData([a],!0):k.deleteExpando||g!=g.window?delete g[h]:g[h]=null)}}}m.extend({cache:{},noData:{"applet ":!0,"embed ":!0,"object ":"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"},hasData:function(a){return a=a.nodeType?m.cache[a[m.expando]]:a[m.expando],!!a&&!P(a)},data:function(a,b,c){return Q(a,b,c)},removeData:function(a,b){return R(a,b)},_data:function(a,b,c){return Q(a,b,c,!0)},_removeData:function(a,b){return R(a,b,!0)}}),m.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=m.data(f),1===f.nodeType&&!m._data(f,"parsedAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=m.camelCase(d.slice(5)),O(f,d,e[d])));m._data(f,"parsedAttrs",!0)}return e}return"object"==typeof a?this.each(function(){m.data(this,a)}):arguments.length>1?this.each(function(){m.data(this,a,b)}):f?O(f,a,m.data(f,a)):void 0},removeData:function(a){return this.each(function(){m.removeData(this,a)})}}),m.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=m._data(a,b),c&&(!d||m.isArray(c)?d=m._data(a,b,m.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=m.queue(a,b),d=c.length,e=c.shift(),f=m._queueHooks(a,b),g=function(){m.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return m._data(a,c)||m._data(a,c,{empty:m.Callbacks("once memory").add(function(){m._removeData(a,b+"queue"),m._removeData(a,c)})})}}),m.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?m.queue(this[0],a):void 0===b?this:this.each(function(){var c=m.queue(this,a,b);m._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&m.dequeue(this,a)})},dequeue:function(a){return this.each(function(){m.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=m.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=m._data(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var S=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,T=["Top","Right","Bottom","Left"],U=function(a,b){return a=b||a,"none"===m.css(a,"display")||!m.contains(a.ownerDocument,a)},V=m.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===m.type(c)){e=!0;for(h in c)m.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,m.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(m(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f},W=/^(?:checkbox|radio)$/i;!function(){var a=y.createElement("input"),b=y.createElement("div"),c=y.createDocumentFragment();if(b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",k.leadingWhitespace=3===b.firstChild.nodeType,k.tbody=!b.getElementsByTagName("tbody").length,k.htmlSerialize=!!b.getElementsByTagName("link").length,k.html5Clone="<:nav></:nav>"!==y.createElement("nav").cloneNode(!0).outerHTML,a.type="checkbox",a.checked=!0,c.appendChild(a),k.appendChecked=a.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue,c.appendChild(b),b.innerHTML="<input type='radio' checked='checked' name='t'/>",k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,k.noCloneEvent=!0,b.attachEvent&&(b.attachEvent("onclick",function(){k.noCloneEvent=!1}),b.cloneNode(!0).click()),null==k.deleteExpando){k.deleteExpando=!0;try{delete b.test}catch(d){k.deleteExpando=!1}}}(),function(){var b,c,d=y.createElement("div");for(b in{submit:!0,change:!0,focusin:!0})c="on"+b,(k[b+"Bubbles"]=c in a)||(d.setAttribute(c,"t"),k[b+"Bubbles"]=d.attributes[c].expando===!1);d=null}();var X=/^(?:input|select|textarea)$/i,Y=/^key/,Z=/^(?:mouse|pointer|contextmenu)|click/,$=/^(?:focusinfocus|focusoutblur)$/,_=/^([^.]*)(?:\.(.+)|)$/;function aa(){return!0}function ba(){return!1}function ca(){try{return y.activeElement}catch(a){}}m.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,n,o,p,q,r=m._data(a);if(r){c.handler&&(i=c,c=i.handler,e=i.selector),c.guid||(c.guid=m.guid++),(g=r.events)||(g=r.events={}),(k=r.handle)||(k=r.handle=function(a){return typeof m===K||a&&m.event.triggered===a.type?void 0:m.event.dispatch.apply(k.elem,arguments)},k.elem=a),b=(b||"").match(E)||[""],h=b.length;while(h--)f=_.exec(b[h])||[],o=q=f[1],p=(f[2]||"").split(".").sort(),o&&(j=m.event.special[o]||{},o=(e?j.delegateType:j.bindType)||o,j=m.event.special[o]||{},l=m.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&m.expr.match.needsContext.test(e),namespace:p.join(".")},i),(n=g[o])||(n=g[o]=[],n.delegateCount=0,j.setup&&j.setup.call(a,d,p,k)!==!1||(a.addEventListener?a.addEventListener(o,k,!1):a.attachEvent&&a.attachEvent("on"+o,k))),j.add&&(j.add.call(a,l),l.handler.guid||(l.handler.guid=c.guid)),e?n.splice(n.delegateCount++,0,l):n.push(l),m.event.global[o]=!0);a=null}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,n,o,p,q,r=m.hasData(a)&&m._data(a);if(r&&(k=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=_.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=m.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,n=k[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),i=f=n.length;while(f--)g=n[f],!e&&q!==g.origType||c&&c.guid!==g.guid||h&&!h.test(g.namespace)||d&&d!==g.selector&&("**"!==d||!g.selector)||(n.splice(f,1),g.selector&&n.delegateCount--,l.remove&&l.remove.call(a,g));i&&!n.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||m.removeEvent(a,o,r.handle),delete k[o])}else for(o in k)m.event.remove(a,o+b[j],c,d,!0);m.isEmptyObject(k)&&(delete r.handle,m._removeData(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,l,n,o=[d||y],p=j.call(b,"type")?b.type:b,q=j.call(b,"namespace")?b.namespace.split("."):[];if(h=l=d=d||y,3!==d.nodeType&&8!==d.nodeType&&!$.test(p+m.event.triggered)&&(p.indexOf(".")>=0&&(q=p.split("."),p=q.shift(),q.sort()),g=p.indexOf(":")<0&&"on"+p,b=b[m.expando]?b:new m.Event(p,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=q.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+q.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:m.makeArray(c,[b]),k=m.event.special[p]||{},e||!k.trigger||k.trigger.apply(d,c)!==!1)){if(!e&&!k.noBubble&&!m.isWindow(d)){for(i=k.delegateType||p,$.test(i+p)||(h=h.parentNode);h;h=h.parentNode)o.push(h),l=h;l===(d.ownerDocument||y)&&o.push(l.defaultView||l.parentWindow||a)}n=0;while((h=o[n++])&&!b.isPropagationStopped())b.type=n>1?i:k.bindType||p,f=(m._data(h,"events")||{})[b.type]&&m._data(h,"handle"),f&&f.apply(h,c),f=g&&h[g],f&&f.apply&&m.acceptData(h)&&(b.result=f.apply(h,c),b.result===!1&&b.preventDefault());if(b.type=p,!e&&!b.isDefaultPrevented()&&(!k._default||k._default.apply(o.pop(),c)===!1)&&m.acceptData(d)&&g&&d[p]&&!m.isWindow(d)){l=d[g],l&&(d[g]=null),m.event.triggered=p;try{d[p]()}catch(r){}m.event.triggered=void 0,l&&(d[g]=l)}return b.result}},dispatch:function(a){a=m.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(m._data(this,"events")||{})[a.type]||[],k=m.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=m.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,g=0;while((e=f.handlers[g++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(e.namespace))&&(a.handleObj=e,a.data=e.data,c=((m.event.special[e.origType]||{}).handle||e.handler).apply(f.elem,i),void 0!==c&&(a.result=c)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!=this;i=i.parentNode||this)if(1===i.nodeType&&(i.disabled!==!0||"click"!==a.type)){for(e=[],f=0;h>f;f++)d=b[f],c=d.selector+" ",void 0===e[c]&&(e[c]=d.needsContext?m(c,this).index(i)>=0:m.find(c,this,null,[i]).length),e[c]&&e.push(d);e.length&&g.push({elem:i,handlers:e})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},fix:function(a){if(a[m.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=Z.test(e)?this.mouseHooks:Y.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new m.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=f.srcElement||y),3===a.target.nodeType&&(a.target=a.target.parentNode),a.metaKey=!!a.metaKey,g.filter?g.filter(a,f):a},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button,g=b.fromElement;return null==a.pageX&&null!=b.clientX&&(d=a.target.ownerDocument||y,e=d.documentElement,c=d.body,a.pageX=b.clientX+(e&&e.scrollLeft||c&&c.scrollLeft||0)-(e&&e.clientLeft||c&&c.clientLeft||0),a.pageY=b.clientY+(e&&e.scrollTop||c&&c.scrollTop||0)-(e&&e.clientTop||c&&c.clientTop||0)),!a.relatedTarget&&g&&(a.relatedTarget=g===a.target?b.toElement:g),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},special:{load:{noBubble:!0},focus:{trigger:function(){if(this!==ca()&&this.focus)try{return this.focus(),!1}catch(a){}},delegateType:"focusin"},blur:{trigger:function(){return this===ca()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return m.nodeName(this,"input")&&"checkbox"===this.type&&this.click?(this.click(),!1):void 0},_default:function(a){return m.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=m.extend(new m.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?m.event.trigger(e,null,b):m.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},m.removeEvent=y.removeEventListener?function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)}:function(a,b,c){var d="on"+b;a.detachEvent&&(typeof a[d]===K&&(a[d]=null),a.detachEvent(d,c))},m.Event=function(a,b){return this instanceof m.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?aa:ba):this.type=a,b&&m.extend(this,b),this.timeStamp=a&&a.timeStamp||m.now(),void(this[m.expando]=!0)):new m.Event(a,b)},m.Event.prototype={isDefaultPrevented:ba,isPropagationStopped:ba,isImmediatePropagationStopped:ba,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=aa,a&&(a.preventDefault?a.preventDefault():a.returnValue=!1)},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=aa,a&&(a.stopPropagation&&a.stopPropagation(),a.cancelBubble=!0)},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=aa,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},m.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){m.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!m.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.submitBubbles||(m.event.special.submit={setup:function(){return m.nodeName(this,"form")?!1:void m.event.add(this,"click._submit keypress._submit",function(a){var b=a.target,c=m.nodeName(b,"input")||m.nodeName(b,"button")?b.form:void 0;c&&!m._data(c,"submitBubbles")&&(m.event.add(c,"submit._submit",function(a){a._submit_bubble=!0}),m._data(c,"submitBubbles",!0))})},postDispatch:function(a){a._submit_bubble&&(delete a._submit_bubble,this.parentNode&&!a.isTrigger&&m.event.simulate("submit",this.parentNode,a,!0))},teardown:function(){return m.nodeName(this,"form")?!1:void m.event.remove(this,"._submit")}}),k.changeBubbles||(m.event.special.change={setup:function(){return X.test(this.nodeName)?(("checkbox"===this.type||"radio"===this.type)&&(m.event.add(this,"propertychange._change",function(a){"checked"===a.originalEvent.propertyName&&(this._just_changed=!0)}),m.event.add(this,"click._change",function(a){this._just_changed&&!a.isTrigger&&(this._just_changed=!1),m.event.simulate("change",this,a,!0)})),!1):void m.event.add(this,"beforeactivate._change",function(a){var b=a.target;X.test(b.nodeName)&&!m._data(b,"changeBubbles")&&(m.event.add(b,"change._change",function(a){!this.parentNode||a.isSimulated||a.isTrigger||m.event.simulate("change",this.parentNode,a,!0)}),m._data(b,"changeBubbles",!0))})},handle:function(a){var b=a.target;return this!==b||a.isSimulated||a.isTrigger||"radio"!==b.type&&"checkbox"!==b.type?a.handleObj.handler.apply(this,arguments):void 0},teardown:function(){return m.event.remove(this,"._change"),!X.test(this.nodeName)}}),k.focusinBubbles||m.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){m.event.simulate(b,a.target,m.event.fix(a),!0)};m.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=m._data(d,b);e||d.addEventListener(a,c,!0),m._data(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=m._data(d,b)-1;e?m._data(d,b,e):(d.removeEventListener(a,c,!0),m._removeData(d,b))}}}),m.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(f in a)this.on(f,b,c,a[f],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=ba;else if(!d)return this;return 1===e&&(g=d,d=function(a){return m().off(a),g.apply(this,arguments)},d.guid=g.guid||(g.guid=m.guid++)),this.each(function(){m.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,m(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=ba),this.each(function(){m.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){m.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?m.event.trigger(a,b,c,!0):void 0}});function da(a){var b=ea.split("|"),c=a.createDocumentFragment();if(c.createElement)while(b.length)c.createElement(b.pop());return c}var ea="abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",fa=/ jQuery\d+="(?:null|\d+)"/g,ga=new RegExp("<(?:"+ea+")[\\s/>]","i"),ha=/^\s+/,ia=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,ja=/<([\w:]+)/,ka=/<tbody/i,la=/<|&#?\w+;/,ma=/<(?:script|style|link)/i,na=/checked\s*(?:[^=]|=\s*.checked.)/i,oa=/^$|\/(?:java|ecma)script/i,pa=/^true\/(.*)/,qa=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ra={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],area:[1,"<map>","</map>"],param:[1,"<object>","</object>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:k.htmlSerialize?[0,"",""]:[1,"X<div>","</div>"]},sa=da(y),ta=sa.appendChild(y.createElement("div"));ra.optgroup=ra.option,ra.tbody=ra.tfoot=ra.colgroup=ra.caption=ra.thead,ra.th=ra.td;function ua(a,b){var c,d,e=0,f=typeof a.getElementsByTagName!==K?a.getElementsByTagName(b||"*"):typeof a.querySelectorAll!==K?a.querySelectorAll(b||"*"):void 0;if(!f)for(f=[],c=a.childNodes||a;null!=(d=c[e]);e++)!b||m.nodeName(d,b)?f.push(d):m.merge(f,ua(d,b));return void 0===b||b&&m.nodeName(a,b)?m.merge([a],f):f}function va(a){W.test(a.type)&&(a.defaultChecked=a.checked)}function wa(a,b){return m.nodeName(a,"table")&&m.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function xa(a){return a.type=(null!==m.find.attr(a,"type"))+"/"+a.type,a}function ya(a){var b=pa.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function za(a,b){for(var c,d=0;null!=(c=a[d]);d++)m._data(c,"globalEval",!b||m._data(b[d],"globalEval"))}function Aa(a,b){if(1===b.nodeType&&m.hasData(a)){var c,d,e,f=m._data(a),g=m._data(b,f),h=f.events;if(h){delete g.handle,g.events={};for(c in h)for(d=0,e=h[c].length;e>d;d++)m.event.add(b,c,h[c][d])}g.data&&(g.data=m.extend({},g.data))}}function Ba(a,b){var c,d,e;if(1===b.nodeType){if(c=b.nodeName.toLowerCase(),!k.noCloneEvent&&b[m.expando]){e=m._data(b);for(d in e.events)m.removeEvent(b,d,e.handle);b.removeAttribute(m.expando)}"script"===c&&b.text!==a.text?(xa(b).text=a.text,ya(b)):"object"===c?(b.parentNode&&(b.outerHTML=a.outerHTML),k.html5Clone&&a.innerHTML&&!m.trim(b.innerHTML)&&(b.innerHTML=a.innerHTML)):"input"===c&&W.test(a.type)?(b.defaultChecked=b.checked=a.checked,b.value!==a.value&&(b.value=a.value)):"option"===c?b.defaultSelected=b.selected=a.defaultSelected:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}}m.extend({clone:function(a,b,c){var d,e,f,g,h,i=m.contains(a.ownerDocument,a);if(k.html5Clone||m.isXMLDoc(a)||!ga.test("<"+a.nodeName+">")?f=a.cloneNode(!0):(ta.innerHTML=a.outerHTML,ta.removeChild(f=ta.firstChild)),!(k.noCloneEvent&&k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||m.isXMLDoc(a)))for(d=ua(f),h=ua(a),g=0;null!=(e=h[g]);++g)d[g]&&Ba(e,d[g]);if(b)if(c)for(h=h||ua(a),d=d||ua(f),g=0;null!=(e=h[g]);g++)Aa(e,d[g]);else Aa(a,f);return d=ua(f,"script"),d.length>0&&za(d,!i&&ua(a,"script")),d=h=e=null,f},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,l,n=a.length,o=da(b),p=[],q=0;n>q;q++)if(f=a[q],f||0===f)if("object"===m.type(f))m.merge(p,f.nodeType?[f]:f);else if(la.test(f)){h=h||o.appendChild(b.createElement("div")),i=(ja.exec(f)||["",""])[1].toLowerCase(),l=ra[i]||ra._default,h.innerHTML=l[1]+f.replace(ia,"<$1></$2>")+l[2],e=l[0];while(e--)h=h.lastChild;if(!k.leadingWhitespace&&ha.test(f)&&p.push(b.createTextNode(ha.exec(f)[0])),!k.tbody){f="table"!==i||ka.test(f)?"<table>"!==l[1]||ka.test(f)?0:h:h.firstChild,e=f&&f.childNodes.length;while(e--)m.nodeName(j=f.childNodes[e],"tbody")&&!j.childNodes.length&&f.removeChild(j)}m.merge(p,h.childNodes),h.textContent="";while(h.firstChild)h.removeChild(h.firstChild);h=o.lastChild}else p.push(b.createTextNode(f));h&&o.removeChild(h),k.appendChecked||m.grep(ua(p,"input"),va),q=0;while(f=p[q++])if((!d||-1===m.inArray(f,d))&&(g=m.contains(f.ownerDocument,f),h=ua(o.appendChild(f),"script"),g&&za(h),c)){e=0;while(f=h[e++])oa.test(f.type||"")&&c.push(f)}return h=null,o},cleanData:function(a,b){for(var d,e,f,g,h=0,i=m.expando,j=m.cache,l=k.deleteExpando,n=m.event.special;null!=(d=a[h]);h++)if((b||m.acceptData(d))&&(f=d[i],g=f&&j[f])){if(g.events)for(e in g.events)n[e]?m.event.remove(d,e):m.removeEvent(d,e,g.handle);j[f]&&(delete j[f],l?delete d[i]:typeof d.removeAttribute!==K?d.removeAttribute(i):d[i]=null,c.push(f))}}}),m.fn.extend({text:function(a){return V(this,function(a){return void 0===a?m.text(this):this.empty().append((this[0]&&this[0].ownerDocument||y).createTextNode(a))},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=wa(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=wa(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?m.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||m.cleanData(ua(c)),c.parentNode&&(b&&m.contains(c.ownerDocument,c)&&za(ua(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++){1===a.nodeType&&m.cleanData(ua(a,!1));while(a.firstChild)a.removeChild(a.firstChild);a.options&&m.nodeName(a,"select")&&(a.options.length=0)}return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return m.clone(this,a,b)})},html:function(a){return V(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a)return 1===b.nodeType?b.innerHTML.replace(fa,""):void 0;if(!("string"!=typeof a||ma.test(a)||!k.htmlSerialize&&ga.test(a)||!k.leadingWhitespace&&ha.test(a)||ra[(ja.exec(a)||["",""])[1].toLowerCase()])){a=a.replace(ia,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(m.cleanData(ua(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,m.cleanData(ua(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,n=this,o=l-1,p=a[0],q=m.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&na.test(p))return this.each(function(c){var d=n.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(i=m.buildFragment(a,this[0].ownerDocument,!1,this),c=i.firstChild,1===i.childNodes.length&&(i=c),c)){for(g=m.map(ua(i,"script"),xa),f=g.length;l>j;j++)d=i,j!==o&&(d=m.clone(d,!0,!0),f&&m.merge(g,ua(d,"script"))),b.call(this[j],d,j);if(f)for(h=g[g.length-1].ownerDocument,m.map(g,ya),j=0;f>j;j++)d=g[j],oa.test(d.type||"")&&!m._data(d,"globalEval")&&m.contains(h,d)&&(d.src?m._evalUrl&&m._evalUrl(d.src):m.globalEval((d.text||d.textContent||d.innerHTML||"").replace(qa,"")));i=c=null}return this}}),m.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){m.fn[a]=function(a){for(var c,d=0,e=[],g=m(a),h=g.length-1;h>=d;d++)c=d===h?this:this.clone(!0),m(g[d])[b](c),f.apply(e,c.get());return this.pushStack(e)}});var Ca,Da={};function Ea(b,c){var d,e=m(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:m.css(e[0],"display");return e.detach(),f}function Fa(a){var b=y,c=Da[a];return c||(c=Ea(a,b),"none"!==c&&c||(Ca=(Ca||m("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=(Ca[0].contentWindow||Ca[0].contentDocument).document,b.write(),b.close(),c=Ea(a,b),Ca.detach()),Da[a]=c),c}!function(){var a;k.shrinkWrapBlocks=function(){if(null!=a)return a;a=!1;var b,c,d;return c=y.getElementsByTagName("body")[0],c&&c.style?(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),typeof b.style.zoom!==K&&(b.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:1px;width:1px;zoom:1",b.appendChild(y.createElement("div")).style.width="5px",a=3!==b.offsetWidth),c.removeChild(d),a):void 0}}();var Ga=/^margin/,Ha=new RegExp("^("+S+")(?!px)[a-z%]+$","i"),Ia,Ja,Ka=/^(top|right|bottom|left)$/;a.getComputedStyle?(Ia=function(b){return b.ownerDocument.defaultView.opener?b.ownerDocument.defaultView.getComputedStyle(b,null):a.getComputedStyle(b,null)},Ja=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ia(a),g=c?c.getPropertyValue(b)||c[b]:void 0,c&&(""!==g||m.contains(a.ownerDocument,a)||(g=m.style(a,b)),Ha.test(g)&&Ga.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0===g?g:g+""}):y.documentElement.currentStyle&&(Ia=function(a){return a.currentStyle},Ja=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ia(a),g=c?c[b]:void 0,null==g&&h&&h[b]&&(g=h[b]),Ha.test(g)&&!Ka.test(b)&&(d=h.left,e=a.runtimeStyle,f=e&&e.left,f&&(e.left=a.currentStyle.left),h.left="fontSize"===b?"1em":g,g=h.pixelLeft+"px",h.left=d,f&&(e.left=f)),void 0===g?g:g+""||"auto"});function La(a,b){return{get:function(){var c=a();if(null!=c)return c?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d,e,f,g,h;if(b=y.createElement("div"),b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",d=b.getElementsByTagName("a")[0],c=d&&d.style){c.cssText="float:left;opacity:.5",k.opacity="0.5"===c.opacity,k.cssFloat=!!c.cssFloat,b.style.backgroundClip="content-box",b.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===b.style.backgroundClip,k.boxSizing=""===c.boxSizing||""===c.MozBoxSizing||""===c.WebkitBoxSizing,m.extend(k,{reliableHiddenOffsets:function(){return null==g&&i(),g},boxSizingReliable:function(){return null==f&&i(),f},pixelPosition:function(){return null==e&&i(),e},reliableMarginRight:function(){return null==h&&i(),h}});function i(){var b,c,d,i;c=y.getElementsByTagName("body")[0],c&&c.style&&(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),b.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",e=f=!1,h=!0,a.getComputedStyle&&(e="1%"!==(a.getComputedStyle(b,null)||{}).top,f="4px"===(a.getComputedStyle(b,null)||{width:"4px"}).width,i=b.appendChild(y.createElement("div")),i.style.cssText=b.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",i.style.marginRight=i.style.width="0",b.style.width="1px",h=!parseFloat((a.getComputedStyle(i,null)||{}).marginRight),b.removeChild(i)),b.innerHTML="<table><tr><td></td><td>t</td></tr></table>",i=b.getElementsByTagName("td"),i[0].style.cssText="margin:0;border:0;padding:0;display:none",g=0===i[0].offsetHeight,g&&(i[0].style.display="",i[1].style.display="none",g=0===i[0].offsetHeight),c.removeChild(d))}}}(),m.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var Ma=/alpha\([^)]*\)/i,Na=/opacity\s*=\s*([^)]*)/,Oa=/^(none|table(?!-c[ea]).+)/,Pa=new RegExp("^("+S+")(.*)$","i"),Qa=new RegExp("^([+-])=("+S+")","i"),Ra={position:"absolute",visibility:"hidden",display:"block"},Sa={letterSpacing:"0",fontWeight:"400"},Ta=["Webkit","O","Moz","ms"];function Ua(a,b){if(b in a)return b;var c=b.charAt(0).toUpperCase()+b.slice(1),d=b,e=Ta.length;while(e--)if(b=Ta[e]+c,b in a)return b;return d}function Va(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=m._data(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&U(d)&&(f[g]=m._data(d,"olddisplay",Fa(d.nodeName)))):(e=U(d),(c&&"none"!==c||!e)&&m._data(d,"olddisplay",e?c:m.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}function Wa(a,b,c){var d=Pa.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Xa(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=m.css(a,c+T[f],!0,e)),d?("content"===c&&(g-=m.css(a,"padding"+T[f],!0,e)),"margin"!==c&&(g-=m.css(a,"border"+T[f]+"Width",!0,e))):(g+=m.css(a,"padding"+T[f],!0,e),"padding"!==c&&(g+=m.css(a,"border"+T[f]+"Width",!0,e)));return g}function Ya(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=Ia(a),g=k.boxSizing&&"border-box"===m.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=Ja(a,b,f),(0>e||null==e)&&(e=a.style[b]),Ha.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Xa(a,b,c||(g?"border":"content"),d,f)+"px"}m.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Ja(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":k.cssFloat?"cssFloat":"styleFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=m.camelCase(b),i=a.style;if(b=m.cssProps[h]||(m.cssProps[h]=Ua(i,h)),g=m.cssHooks[b]||m.cssHooks[h],void 0===c)return g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b];if(f=typeof c,"string"===f&&(e=Qa.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(m.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||m.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),!(g&&"set"in g&&void 0===(c=g.set(a,c,d)))))try{i[b]=c}catch(j){}}},css:function(a,b,c,d){var e,f,g,h=m.camelCase(b);return b=m.cssProps[h]||(m.cssProps[h]=Ua(a.style,h)),g=m.cssHooks[b]||m.cssHooks[h],g&&"get"in g&&(f=g.get(a,!0,c)),void 0===f&&(f=Ja(a,b,d)),"normal"===f&&b in Sa&&(f=Sa[b]),""===c||c?(e=parseFloat(f),c===!0||m.isNumeric(e)?e||0:f):f}}),m.each(["height","width"],function(a,b){m.cssHooks[b]={get:function(a,c,d){return c?Oa.test(m.css(a,"display"))&&0===a.offsetWidth?m.swap(a,Ra,function(){return Ya(a,b,d)}):Ya(a,b,d):void 0},set:function(a,c,d){var e=d&&Ia(a);return Wa(a,c,d?Xa(a,b,d,k.boxSizing&&"border-box"===m.css(a,"boxSizing",!1,e),e):0)}}}),k.opacity||(m.cssHooks.opacity={get:function(a,b){return Na.test((b&&a.currentStyle?a.currentStyle.filter:a.style.filter)||"")?.01*parseFloat(RegExp.$1)+"":b?"1":""},set:function(a,b){var c=a.style,d=a.currentStyle,e=m.isNumeric(b)?"alpha(opacity="+100*b+")":"",f=d&&d.filter||c.filter||"";c.zoom=1,(b>=1||""===b)&&""===m.trim(f.replace(Ma,""))&&c.removeAttribute&&(c.removeAttribute("filter"),""===b||d&&!d.filter)||(c.filter=Ma.test(f)?f.replace(Ma,e):f+" "+e)}}),m.cssHooks.marginRight=La(k.reliableMarginRight,function(a,b){return b?m.swap(a,{display:"inline-block"},Ja,[a,"marginRight"]):void 0}),m.each({margin:"",padding:"",border:"Width"},function(a,b){m.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+T[d]+b]=f[d]||f[d-2]||f[0];return e}},Ga.test(a)||(m.cssHooks[a+b].set=Wa)}),m.fn.extend({css:function(a,b){return V(this,function(a,b,c){var d,e,f={},g=0;if(m.isArray(b)){for(d=Ia(a),e=b.length;e>g;g++)f[b[g]]=m.css(a,b[g],!1,d);return f}return void 0!==c?m.style(a,b,c):m.css(a,b)},a,b,arguments.length>1)},show:function(){return Va(this,!0)},hide:function(){return Va(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){U(this)?m(this).show():m(this).hide()})}});function Za(a,b,c,d,e){
return new Za.prototype.init(a,b,c,d,e)}m.Tween=Za,Za.prototype={constructor:Za,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(m.cssNumber[c]?"":"px")},cur:function(){var a=Za.propHooks[this.prop];return a&&a.get?a.get(this):Za.propHooks._default.get(this)},run:function(a){var b,c=Za.propHooks[this.prop];return this.options.duration?this.pos=b=m.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Za.propHooks._default.set(this),this}},Za.prototype.init.prototype=Za.prototype,Za.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=m.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){m.fx.step[a.prop]?m.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[m.cssProps[a.prop]]||m.cssHooks[a.prop])?m.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Za.propHooks.scrollTop=Za.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},m.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},m.fx=Za.prototype.init,m.fx.step={};var $a,_a,ab=/^(?:toggle|show|hide)$/,bb=new RegExp("^(?:([+-])=|)("+S+")([a-z%]*)$","i"),cb=/queueHooks$/,db=[ib],eb={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=bb.exec(b),f=e&&e[3]||(m.cssNumber[a]?"":"px"),g=(m.cssNumber[a]||"px"!==f&&+d)&&bb.exec(m.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,m.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function fb(){return setTimeout(function(){$a=void 0}),$a=m.now()}function gb(a,b){var c,d={height:a},e=0;for(b=b?1:0;4>e;e+=2-b)c=T[e],d["margin"+c]=d["padding"+c]=a;return b&&(d.opacity=d.width=a),d}function hb(a,b,c){for(var d,e=(eb[b]||[]).concat(eb["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function ib(a,b,c){var d,e,f,g,h,i,j,l,n=this,o={},p=a.style,q=a.nodeType&&U(a),r=m._data(a,"fxshow");c.queue||(h=m._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,n.always(function(){n.always(function(){h.unqueued--,m.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[p.overflow,p.overflowX,p.overflowY],j=m.css(a,"display"),l="none"===j?m._data(a,"olddisplay")||Fa(a.nodeName):j,"inline"===l&&"none"===m.css(a,"float")&&(k.inlineBlockNeedsLayout&&"inline"!==Fa(a.nodeName)?p.zoom=1:p.display="inline-block")),c.overflow&&(p.overflow="hidden",k.shrinkWrapBlocks()||n.always(function(){p.overflow=c.overflow[0],p.overflowX=c.overflow[1],p.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],ab.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(q?"hide":"show")){if("show"!==e||!r||void 0===r[d])continue;q=!0}o[d]=r&&r[d]||m.style(a,d)}else j=void 0;if(m.isEmptyObject(o))"inline"===("none"===j?Fa(a.nodeName):j)&&(p.display=j);else{r?"hidden"in r&&(q=r.hidden):r=m._data(a,"fxshow",{}),f&&(r.hidden=!q),q?m(a).show():n.done(function(){m(a).hide()}),n.done(function(){var b;m._removeData(a,"fxshow");for(b in o)m.style(a,b,o[b])});for(d in o)g=hb(q?r[d]:0,d,n),d in r||(r[d]=g.start,q&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function jb(a,b){var c,d,e,f,g;for(c in a)if(d=m.camelCase(c),e=b[d],f=a[c],m.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=m.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function kb(a,b,c){var d,e,f=0,g=db.length,h=m.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=$a||fb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:m.extend({},b),opts:m.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:$a||fb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=m.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(jb(k,j.opts.specialEasing);g>f;f++)if(d=db[f].call(j,a,k,j.opts))return d;return m.map(k,hb,j),m.isFunction(j.opts.start)&&j.opts.start.call(a,j),m.fx.timer(m.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}m.Animation=m.extend(kb,{tweener:function(a,b){m.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],eb[c]=eb[c]||[],eb[c].unshift(b)},prefilter:function(a,b){b?db.unshift(a):db.push(a)}}),m.speed=function(a,b,c){var d=a&&"object"==typeof a?m.extend({},a):{complete:c||!c&&b||m.isFunction(a)&&a,duration:a,easing:c&&b||b&&!m.isFunction(b)&&b};return d.duration=m.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in m.fx.speeds?m.fx.speeds[d.duration]:m.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){m.isFunction(d.old)&&d.old.call(this),d.queue&&m.dequeue(this,d.queue)},d},m.fn.extend({fadeTo:function(a,b,c,d){return this.filter(U).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=m.isEmptyObject(a),f=m.speed(b,c,d),g=function(){var b=kb(this,m.extend({},a),f);(e||m._data(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=m.timers,g=m._data(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&cb.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&m.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=m._data(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=m.timers,g=d?d.length:0;for(c.finish=!0,m.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),m.each(["toggle","show","hide"],function(a,b){var c=m.fn[b];m.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(gb(b,!0),a,d,e)}}),m.each({slideDown:gb("show"),slideUp:gb("hide"),slideToggle:gb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){m.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),m.timers=[],m.fx.tick=function(){var a,b=m.timers,c=0;for($a=m.now();c<b.length;c++)a=b[c],a()||b[c]!==a||b.splice(c--,1);b.length||m.fx.stop(),$a=void 0},m.fx.timer=function(a){m.timers.push(a),a()?m.fx.start():m.timers.pop()},m.fx.interval=13,m.fx.start=function(){_a||(_a=setInterval(m.fx.tick,m.fx.interval))},m.fx.stop=function(){clearInterval(_a),_a=null},m.fx.speeds={slow:600,fast:200,_default:400},m.fn.delay=function(a,b){return a=m.fx?m.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a,b,c,d,e;b=y.createElement("div"),b.setAttribute("className","t"),b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",d=b.getElementsByTagName("a")[0],c=y.createElement("select"),e=c.appendChild(y.createElement("option")),a=b.getElementsByTagName("input")[0],d.style.cssText="top:1px",k.getSetAttribute="t"!==b.className,k.style=/top/.test(d.getAttribute("style")),k.hrefNormalized="/a"===d.getAttribute("href"),k.checkOn=!!a.value,k.optSelected=e.selected,k.enctype=!!y.createElement("form").enctype,c.disabled=!0,k.optDisabled=!e.disabled,a=y.createElement("input"),a.setAttribute("value",""),k.input=""===a.getAttribute("value"),a.value="t",a.setAttribute("type","radio"),k.radioValue="t"===a.value}();var lb=/\r/g;m.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=m.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,m(this).val()):a,null==e?e="":"number"==typeof e?e+="":m.isArray(e)&&(e=m.map(e,function(a){return null==a?"":a+""})),b=m.valHooks[this.type]||m.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=m.valHooks[e.type]||m.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(lb,""):null==c?"":c)}}}),m.extend({valHooks:{option:{get:function(a){var b=m.find.attr(a,"value");return null!=b?b:m.trim(m.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&m.nodeName(c.parentNode,"optgroup"))){if(b=m(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=m.makeArray(b),g=e.length;while(g--)if(d=e[g],m.inArray(m.valHooks.option.get(d),f)>=0)try{d.selected=c=!0}catch(h){d.scrollHeight}else d.selected=!1;return c||(a.selectedIndex=-1),e}}}}),m.each(["radio","checkbox"],function(){m.valHooks[this]={set:function(a,b){return m.isArray(b)?a.checked=m.inArray(m(a).val(),b)>=0:void 0}},k.checkOn||(m.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})});var mb,nb,ob=m.expr.attrHandle,pb=/^(?:checked|selected)$/i,qb=k.getSetAttribute,rb=k.input;m.fn.extend({attr:function(a,b){return V(this,m.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){m.removeAttr(this,a)})}}),m.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===K?m.prop(a,b,c):(1===f&&m.isXMLDoc(a)||(b=b.toLowerCase(),d=m.attrHooks[b]||(m.expr.match.bool.test(b)?nb:mb)),void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=m.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void m.removeAttr(a,b))},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=m.propFix[c]||c,m.expr.match.bool.test(c)?rb&&qb||!pb.test(c)?a[d]=!1:a[m.camelCase("default-"+c)]=a[d]=!1:m.attr(a,c,""),a.removeAttribute(qb?c:d)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&m.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),nb={set:function(a,b,c){return b===!1?m.removeAttr(a,c):rb&&qb||!pb.test(c)?a.setAttribute(!qb&&m.propFix[c]||c,c):a[m.camelCase("default-"+c)]=a[c]=!0,c}},m.each(m.expr.match.bool.source.match(/\w+/g),function(a,b){var c=ob[b]||m.find.attr;ob[b]=rb&&qb||!pb.test(b)?function(a,b,d){var e,f;return d||(f=ob[b],ob[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,ob[b]=f),e}:function(a,b,c){return c?void 0:a[m.camelCase("default-"+b)]?b.toLowerCase():null}}),rb&&qb||(m.attrHooks.value={set:function(a,b,c){return m.nodeName(a,"input")?void(a.defaultValue=b):mb&&mb.set(a,b,c)}}),qb||(mb={set:function(a,b,c){var d=a.getAttributeNode(c);return d||a.setAttributeNode(d=a.ownerDocument.createAttribute(c)),d.value=b+="","value"===c||b===a.getAttribute(c)?b:void 0}},ob.id=ob.name=ob.coords=function(a,b,c){var d;return c?void 0:(d=a.getAttributeNode(b))&&""!==d.value?d.value:null},m.valHooks.button={get:function(a,b){var c=a.getAttributeNode(b);return c&&c.specified?c.value:void 0},set:mb.set},m.attrHooks.contenteditable={set:function(a,b,c){mb.set(a,""===b?!1:b,c)}},m.each(["width","height"],function(a,b){m.attrHooks[b]={set:function(a,c){return""===c?(a.setAttribute(b,"auto"),c):void 0}}})),k.style||(m.attrHooks.style={get:function(a){return a.style.cssText||void 0},set:function(a,b){return a.style.cssText=b+""}});var sb=/^(?:input|select|textarea|button|object)$/i,tb=/^(?:a|area)$/i;m.fn.extend({prop:function(a,b){return V(this,m.prop,a,b,arguments.length>1)},removeProp:function(a){return a=m.propFix[a]||a,this.each(function(){try{this[a]=void 0,delete this[a]}catch(b){}})}}),m.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!m.isXMLDoc(a),f&&(b=m.propFix[b]||b,e=m.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){var b=m.find.attr(a,"tabindex");return b?parseInt(b,10):sb.test(a.nodeName)||tb.test(a.nodeName)&&a.href?0:-1}}}}),k.hrefNormalized||m.each(["href","src"],function(a,b){m.propHooks[b]={get:function(a){return a.getAttribute(b,4)}}}),k.optSelected||(m.propHooks.selected={get:function(a){var b=a.parentNode;return b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex),null}}),m.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){m.propFix[this.toLowerCase()]=this}),k.enctype||(m.propFix.enctype="encoding");var ub=/[\t\r\n\f]/g;m.fn.extend({addClass:function(a){var b,c,d,e,f,g,h=0,i=this.length,j="string"==typeof a&&a;if(m.isFunction(a))return this.each(function(b){m(this).addClass(a.call(this,b,this.className))});if(j)for(b=(a||"").match(E)||[];i>h;h++)if(c=this[h],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ub," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=m.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0,i=this.length,j=0===arguments.length||"string"==typeof a&&a;if(m.isFunction(a))return this.each(function(b){m(this).removeClass(a.call(this,b,this.className))});if(j)for(b=(a||"").match(E)||[];i>h;h++)if(c=this[h],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ub," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?m.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(m.isFunction(a)?function(c){m(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=m(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===K||"boolean"===c)&&(this.className&&m._data(this,"__className__",this.className),this.className=this.className||a===!1?"":m._data(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ub," ").indexOf(b)>=0)return!0;return!1}}),m.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){m.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),m.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var vb=m.now(),wb=/\?/,xb=/(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;m.parseJSON=function(b){if(a.JSON&&a.JSON.parse)return a.JSON.parse(b+"");var c,d=null,e=m.trim(b+"");return e&&!m.trim(e.replace(xb,function(a,b,e,f){return c&&b&&(d=0),0===d?a:(c=e||b,d+=!f-!e,"")}))?Function("return "+e)():m.error("Invalid JSON: "+b)},m.parseXML=function(b){var c,d;if(!b||"string"!=typeof b)return null;try{a.DOMParser?(d=new DOMParser,c=d.parseFromString(b,"text/xml")):(c=new ActiveXObject("Microsoft.XMLDOM"),c.async="false",c.loadXML(b))}catch(e){c=void 0}return c&&c.documentElement&&!c.getElementsByTagName("parsererror").length||m.error("Invalid XML: "+b),c};var yb,zb,Ab=/#.*$/,Bb=/([?&])_=[^&]*/,Cb=/^(.*?):[ \t]*([^\r\n]*)\r?$/gm,Db=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Eb=/^(?:GET|HEAD)$/,Fb=/^\/\//,Gb=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,Hb={},Ib={},Jb="*/".concat("*");try{zb=location.href}catch(Kb){zb=y.createElement("a"),zb.href="",zb=zb.href}yb=Gb.exec(zb.toLowerCase())||[];function Lb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(m.isFunction(c))while(d=f[e++])"+"===d.charAt(0)?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function Mb(a,b,c,d){var e={},f=a===Ib;function g(h){var i;return e[h]=!0,m.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function Nb(a,b){var c,d,e=m.ajaxSettings.flatOptions||{};for(d in b)void 0!==b[d]&&((e[d]?a:c||(c={}))[d]=b[d]);return c&&m.extend(!0,a,c),a}function Ob(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===e&&(e=a.mimeType||b.getResponseHeader("Content-Type"));if(e)for(g in h)if(h[g]&&h[g].test(e)){i.unshift(g);break}if(i[0]in c)f=i[0];else{for(g in c){if(!i[0]||a.converters[g+" "+i[0]]){f=g;break}d||(d=g)}f=f||d}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function Pb(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}m.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:zb,type:"GET",isLocal:Db.test(yb[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":Jb,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":m.parseJSON,"text xml":m.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?Nb(Nb(a,m.ajaxSettings),b):Nb(m.ajaxSettings,a)},ajaxPrefilter:Lb(Hb),ajaxTransport:Lb(Ib),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=m.ajaxSetup({},b),l=k.context||k,n=k.context&&(l.nodeType||l.jquery)?m(l):m.event,o=m.Deferred(),p=m.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!j){j={};while(b=Cb.exec(f))j[b[1].toLowerCase()]=b[2]}b=j[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?f:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return i&&i.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||zb)+"").replace(Ab,"").replace(Fb,yb[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=m.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(c=Gb.exec(k.url.toLowerCase()),k.crossDomain=!(!c||c[1]===yb[1]&&c[2]===yb[2]&&(c[3]||("http:"===c[1]?"80":"443"))===(yb[3]||("http:"===yb[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=m.param(k.data,k.traditional)),Mb(Hb,k,b,v),2===t)return v;h=m.event&&k.global,h&&0===m.active++&&m.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!Eb.test(k.type),e=k.url,k.hasContent||(k.data&&(e=k.url+=(wb.test(e)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=Bb.test(e)?e.replace(Bb,"$1_="+vb++):e+(wb.test(e)?"&":"?")+"_="+vb++)),k.ifModified&&(m.lastModified[e]&&v.setRequestHeader("If-Modified-Since",m.lastModified[e]),m.etag[e]&&v.setRequestHeader("If-None-Match",m.etag[e])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+Jb+"; q=0.01":""):k.accepts["*"]);for(d in k.headers)v.setRequestHeader(d,k.headers[d]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(d in{success:1,error:1,complete:1})v[d](k[d]);if(i=Mb(Ib,k,b,v)){v.readyState=1,h&&n.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,i.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,c,d){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),i=void 0,f=d||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,c&&(u=Ob(k,v,c)),u=Pb(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(m.lastModified[e]=w),w=v.getResponseHeader("etag"),w&&(m.etag[e]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,h&&n.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),h&&(n.trigger("ajaxComplete",[v,k]),--m.active||m.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return m.get(a,b,c,"json")},getScript:function(a,b){return m.get(a,void 0,b,"script")}}),m.each(["get","post"],function(a,b){m[b]=function(a,c,d,e){return m.isFunction(c)&&(e=e||d,d=c,c=void 0),m.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),m._evalUrl=function(a){return m.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},m.fn.extend({wrapAll:function(a){if(m.isFunction(a))return this.each(function(b){m(this).wrapAll(a.call(this,b))});if(this[0]){var b=m(a,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstChild&&1===a.firstChild.nodeType)a=a.firstChild;return a}).append(this)}return this},wrapInner:function(a){return this.each(m.isFunction(a)?function(b){m(this).wrapInner(a.call(this,b))}:function(){var b=m(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=m.isFunction(a);return this.each(function(c){m(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){m.nodeName(this,"body")||m(this).replaceWith(this.childNodes)}).end()}}),m.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0||!k.reliableHiddenOffsets()&&"none"===(a.style&&a.style.display||m.css(a,"display"))},m.expr.filters.visible=function(a){return!m.expr.filters.hidden(a)};var Qb=/%20/g,Rb=/\[\]$/,Sb=/\r?\n/g,Tb=/^(?:submit|button|image|reset|file)$/i,Ub=/^(?:input|select|textarea|keygen)/i;function Vb(a,b,c,d){var e;if(m.isArray(b))m.each(b,function(b,e){c||Rb.test(a)?d(a,e):Vb(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==m.type(b))d(a,b);else for(e in b)Vb(a+"["+e+"]",b[e],c,d)}m.param=function(a,b){var c,d=[],e=function(a,b){b=m.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=m.ajaxSettings&&m.ajaxSettings.traditional),m.isArray(a)||a.jquery&&!m.isPlainObject(a))m.each(a,function(){e(this.name,this.value)});else for(c in a)Vb(c,a[c],b,e);return d.join("&").replace(Qb,"+")},m.fn.extend({serialize:function(){return m.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=m.prop(this,"elements");return a?m.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!m(this).is(":disabled")&&Ub.test(this.nodeName)&&!Tb.test(a)&&(this.checked||!W.test(a))}).map(function(a,b){var c=m(this).val();return null==c?null:m.isArray(c)?m.map(c,function(a){return{name:b.name,value:a.replace(Sb,"\r\n")}}):{name:b.name,value:c.replace(Sb,"\r\n")}}).get()}}),m.ajaxSettings.xhr=void 0!==a.ActiveXObject?function(){return!this.isLocal&&/^(get|post|head|put|delete|options)$/i.test(this.type)&&Zb()||$b()}:Zb;var Wb=0,Xb={},Yb=m.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in Xb)Xb[a](void 0,!0)}),k.cors=!!Yb&&"withCredentials"in Yb,Yb=k.ajax=!!Yb,Yb&&m.ajaxTransport(function(a){if(!a.crossDomain||k.cors){var b;return{send:function(c,d){var e,f=a.xhr(),g=++Wb;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)void 0!==c[e]&&f.setRequestHeader(e,c[e]+"");f.send(a.hasContent&&a.data||null),b=function(c,e){var h,i,j;if(b&&(e||4===f.readyState))if(delete Xb[g],b=void 0,f.onreadystatechange=m.noop,e)4!==f.readyState&&f.abort();else{j={},h=f.status,"string"==typeof f.responseText&&(j.text=f.responseText);try{i=f.statusText}catch(k){i=""}h||!a.isLocal||a.crossDomain?1223===h&&(h=204):h=j.text?200:404}j&&d(h,i,j,f.getAllResponseHeaders())},a.async?4===f.readyState?setTimeout(b):f.onreadystatechange=Xb[g]=b:b()},abort:function(){b&&b(void 0,!0)}}}});function Zb(){try{return new a.XMLHttpRequest}catch(b){}}function $b(){try{return new a.ActiveXObject("Microsoft.XMLHTTP")}catch(b){}}m.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return m.globalEval(a),a}}}),m.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET",a.global=!1)}),m.ajaxTransport("script",function(a){if(a.crossDomain){var b,c=y.head||m("head")[0]||y.documentElement;return{send:function(d,e){b=y.createElement("script"),b.async=!0,a.scriptCharset&&(b.charset=a.scriptCharset),b.src=a.url,b.onload=b.onreadystatechange=function(a,c){(c||!b.readyState||/loaded|complete/.test(b.readyState))&&(b.onload=b.onreadystatechange=null,b.parentNode&&b.parentNode.removeChild(b),b=null,c||e(200,"success"))},c.insertBefore(b,c.firstChild)},abort:function(){b&&b.onload(void 0,!0)}}}});var _b=[],ac=/(=)\?(?=&|$)|\?\?/;m.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=_b.pop()||m.expando+"_"+vb++;return this[a]=!0,a}}),m.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(ac.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&ac.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=m.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(ac,"$1"+e):b.jsonp!==!1&&(b.url+=(wb.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||m.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,_b.push(e)),g&&m.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),m.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||y;var d=u.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=m.buildFragment([a],b,e),e&&e.length&&m(e).remove(),m.merge([],d.childNodes))};var bc=m.fn.load;m.fn.load=function(a,b,c){if("string"!=typeof a&&bc)return bc.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=m.trim(a.slice(h,a.length)),a=a.slice(0,h)),m.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(f="POST"),g.length>0&&m.ajax({url:a,type:f,dataType:"html",data:b}).done(function(a){e=arguments,g.html(d?m("<div>").append(m.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,e||[a.responseText,b,a])}),this},m.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){m.fn[b]=function(a){return this.on(b,a)}}),m.expr.filters.animated=function(a){return m.grep(m.timers,function(b){return a===b.elem}).length};var cc=a.document.documentElement;function dc(a){return m.isWindow(a)?a:9===a.nodeType?a.defaultView||a.parentWindow:!1}m.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=m.css(a,"position"),l=m(a),n={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=m.css(a,"top"),i=m.css(a,"left"),j=("absolute"===k||"fixed"===k)&&m.inArray("auto",[f,i])>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),m.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(n.top=b.top-h.top+g),null!=b.left&&(n.left=b.left-h.left+e),"using"in b?b.using.call(a,n):l.css(n)}},m.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){m.offset.setOffset(this,a,b)});var b,c,d={top:0,left:0},e=this[0],f=e&&e.ownerDocument;if(f)return b=f.documentElement,m.contains(b,e)?(typeof e.getBoundingClientRect!==K&&(d=e.getBoundingClientRect()),c=dc(f),{top:d.top+(c.pageYOffset||b.scrollTop)-(b.clientTop||0),left:d.left+(c.pageXOffset||b.scrollLeft)-(b.clientLeft||0)}):d},position:function(){if(this[0]){var a,b,c={top:0,left:0},d=this[0];return"fixed"===m.css(d,"position")?b=d.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),m.nodeName(a[0],"html")||(c=a.offset()),c.top+=m.css(a[0],"borderTopWidth",!0),c.left+=m.css(a[0],"borderLeftWidth",!0)),{top:b.top-c.top-m.css(d,"marginTop",!0),left:b.left-c.left-m.css(d,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||cc;while(a&&!m.nodeName(a,"html")&&"static"===m.css(a,"position"))a=a.offsetParent;return a||cc})}}),m.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,b){var c=/Y/.test(b);m.fn[a]=function(d){return V(this,function(a,d,e){var f=dc(a);return void 0===e?f?b in f?f[b]:f.document.documentElement[d]:a[d]:void(f?f.scrollTo(c?m(f).scrollLeft():e,c?e:m(f).scrollTop()):a[d]=e)},a,d,arguments.length,null)}}),m.each(["top","left"],function(a,b){m.cssHooks[b]=La(k.pixelPosition,function(a,c){return c?(c=Ja(a,b),Ha.test(c)?m(a).position()[b]+"px":c):void 0})}),m.each({Height:"height",Width:"width"},function(a,b){m.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){m.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return V(this,function(b,c,d){var e;return m.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?m.css(b,c,g):m.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),m.fn.size=function(){return this.length},m.fn.andSelf=m.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return m});var ec=a.jQuery,fc=a.$;return m.noConflict=function(b){return a.$===m&&(a.$=fc),b&&a.jQuery===m&&(a.jQuery=ec),m},typeof b===K&&(a.jQuery=a.$=m),m});

//     Backbone.js 1.2.0

//     (c) 2010-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(factory) {

  // Establish the root object, `window` (`self`) in the browser, or `global` on the server.
  // We use `self` instead of `window` for `WebWorker` support.
  var root = (typeof self == 'object' && self.self == self && self) ||
      (typeof global == 'object' && global.global == global && global);

  // Set up Backbone appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define('backbone',['underscore', 'jquery', 'exports'], function(_, $, exports) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backbone.
      root.Backbone = factory(root, exports, _, $);
    });

    // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore'), $;
    try { $ = require('jquery'); } catch(e) {}
    factory(root, exports, _, $);

    // Finally, as a browser global.
  } else {
    root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
  }

}(function(root, Backbone, _, $) {

  // Initial Setup
  // -------------

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create local references to array methods we'll want to use later.
  var array = [];
  var slice = array.slice;

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.2.0';

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = $;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PATCH"`, `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... this will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {};

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Iterates over the standard `event, callback` (as well as the fancy multiple
  // space-separated events `"change blur", callback` and jQuery-style event
  // maps `{event: callback}`), reducing them by manipulating `memo`.
  // Passes a normalized single event name and callback, as well as any
  // optional `opts`.
  var eventsApi = function(iteratee, memo, name, callback, opts) {
    var i = 0, names;
    if (name && typeof name === 'object') {
      // Handle event maps.
      for (names = _.keys(name); i < names.length ; i++) {
        memo = iteratee(memo, names[i], name[names[i]], opts);
      }
    } else if (name && eventSplitter.test(name)) {
      // Handle space separated event names.
      for (names = name.split(eventSplitter); i < names.length; i++) {
        memo = iteratee(memo, names[i], callback, opts);
      }
    } else {
      memo = iteratee(memo, name, callback, opts);
    }
    return memo;
  };

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  Events.on = function(name, callback, context) {
    return internalOn(this, name, callback, context);
  };

  // An internal use `on` function, used to guard the `listening` argument from
  // the public API.
  var internalOn = function(obj, name, callback, context, listening) {
    obj._events = eventsApi(onApi, obj._events || {}, name, callback, {
      context: context,
      ctx: obj,
      listening: listening
    });

    if (listening) {
      var listeners = obj._listeners || (obj._listeners = {});
      listeners[listening.id] = listening;
    }

    return obj;
  };

  // Inversion-of-control versions of `on`. Tell *this* object to listen to
  // an event in another object... keeping track of what it's listening to.
  Events.listenTo =  function(obj, name, callback) {
    if (!obj) return this;
    var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
    var listeningTo = this._listeningTo || (this._listeningTo = {});
    var listening = listeningTo[id];

    // This object is not listening to any other events on `obj` yet.
    // Setup the necessary references to track the listening callbacks.
    if (!listening) {
      var thisId = this._listenId || (this._listenId = _.uniqueId('l'));
      listening = listeningTo[id] = {obj: obj, objId: id, id: thisId, listeningTo: listeningTo, count: 0};
    }

    // Bind callbacks on obj, and keep track of them on listening.
    internalOn(obj, name, callback, this, listening);
    return this;
  };

  // The reducing API that adds a callback to the `events` object.
  var onApi = function(events, name, callback, options) {
    if (callback) {
      var handlers = events[name] || (events[name] = []);
      var context = options.context, ctx = options.ctx, listening = options.listening;
      if (listening) listening.count++;

      handlers.push({ callback: callback, context: context, ctx: context || ctx, listening: listening });
    }
    return events;
  };

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  Events.off =  function(name, callback, context) {
    if (!this._events) return this;
    this._events = eventsApi(offApi, this._events, name, callback, {
      context: context,
      listeners: this._listeners
    });
    return this;
  };

  // Tell this object to stop listening to either specific events ... or
  // to every object it's currently listening to.
  Events.stopListening =  function(obj, name, callback) {
    var listeningTo = this._listeningTo;
    if (!listeningTo) return this;

    var ids = obj ? [obj._listenId] : _.keys(listeningTo);

    for (var i = 0; i < ids.length; i++) {
      var listening = listeningTo[ids[i]];

      // If listening doesn't exist, this object is not currently
      // listening to obj. Break out early.
      if (!listening) break;

      listening.obj.off(name, callback, this);
    }
    if (_.isEmpty(listeningTo)) this._listeningTo = void 0;

    return this;
  };

  // The reducing API that removes a callback from the `events` object.
  var offApi = function(events, name, callback, options) {
    // No events to consider.
    if (!events) return;

    var i = 0, length, listening;
    var context = options.context, listeners = options.listeners;

    // Delete all events listeners and "drop" events.
    if (!name && !callback && !context) {
      var ids = _.keys(listeners);
      for (; i < ids.length; i++) {
        listening = listeners[ids[i]];
        delete listeners[listening.id];
        delete listening.listeningTo[listening.objId];
      }
      return;
    }

    var names = name ? [name] : _.keys(events);
    for (; i < names.length; i++) {
      name = names[i];
      var handlers = events[name];

      // Bail out if there are no events stored.
      if (!handlers) break;

      // Replace events if there are any remaining.  Otherwise, clean up.
      var remaining = [];
      for (var j = 0; j < handlers.length; j++) {
        var handler = handlers[j];
        if (
            callback && callback !== handler.callback &&
            callback !== handler.callback._callback ||
            context && context !== handler.context
        ) {
          remaining.push(handler);
        } else {
          listening = handler.listening;
          if (listening && --listening.count === 0) {
            delete listeners[listening.id];
            delete listening.listeningTo[listening.objId];
          }
        }
      }

      // Update tail event if the list has any events.  Otherwise, clean up.
      if (remaining.length) {
        events[name] = remaining;
      } else {
        delete events[name];
      }
    }
    if (_.size(events)) return events;
  };

  // Bind an event to only be triggered a single time. After the first time
  // the callback is invoked, it will be removed. When multiple events are
  // passed in using the space-separated syntax, the event will fire once for every
  // event you passed in, not once for a combination of all events
  Events.once =  function(name, callback, context) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
    return this.on(events, void 0, context);
  };

  // Inversion-of-control versions of `once`.
  Events.listenToOnce =  function(obj, name, callback) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
    return this.listenTo(obj, events);
  };

  // Reduces the event callbacks into a map of `{event: onceWrapper}`.
  // `offer` unbinds the `onceWrapper` after it as been called.
  var onceMap = function(map, name, callback, offer) {
    if (callback) {
      var once = map[name] = _.once(function() {
        offer(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
    }
    return map;
  };

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  Events.trigger =  function(name) {
    if (!this._events) return this;

    var length = Math.max(0, arguments.length - 1);
    var args = Array(length);
    for (var i = 0; i < length; i++) args[i] = arguments[i + 1];

    eventsApi(triggerApi, this._events, name, void 0, args);
    return this;
  };

  // Handles triggering the appropriate event callbacks.
  var triggerApi = function(objEvents, name, cb, args) {
    if (objEvents) {
      var events = objEvents[name];
      var allEvents = objEvents.all;
      if (events && allEvents) allEvents = allEvents.slice();
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, [name].concat(args));
    }
    return objEvents;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
    }
  };

  // Proxy Underscore methods to a Backbone class' prototype using a
  // particular attribute as the data argument
  var addMethod = function(length, method, attribute) {
    switch (length) {
      case 1: return function() {
        return _[method](this[attribute]);
      };
      case 2: return function(value) {
        return _[method](this[attribute], value);
      };
      case 3: return function(iteratee, context) {
        return _[method](this[attribute], iteratee, context);
      };
      case 4: return function(iteratee, defaultVal, context) {
        return _[method](this[attribute], iteratee, defaultVal, context);
      };
      default: return function() {
        var args = slice.call(arguments);
        args.unshift(this[attribute]);
        return _[method].apply(_, args);
      };
    }
  };
  var addUnderscoreMethods = function(Class, methods, attribute) {
    _.each(methods, function(length, method) {
      if (_[method]) Class.prototype[method] = addMethod(length, method, attribute);
    });
  };

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId(this.cidPrefix);
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    attrs = _.defaults({}, attrs, _.result(this, 'defaults'));
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // The prefix is used to create the client id which is used to identify models locally.
    // You may want to override this if you're experiencing name clashes with model ids.
    cidPrefix: 'c',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Special-cased proxy to underscore's `_.matches` method.
    matches: function(attrs) {
      return !!_.iteratee(attrs, this)(this.attributes);
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      var attr, attrs, unset, changes, silent, changing, prev, current;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      unset           = options.unset;
      silent          = options.silent;
      changes         = [];
      changing        = this._changing;
      this._changing  = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }
      current = this.attributes, prev = this._previousAttributes;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      // For each `set` attribute, update or delete the current value.
      for (attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          this.changed[attr] = val;
        } else {
          delete this.changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = options;
        for (var i = 0; i < changes.length; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          options = this._pending;
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server, merging the response with the model's
    // local attributes. Any changed attributes will trigger a "change" event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        if (!model.set(model.parse(resp, options), options)) return false;
        if (success) success.call(options.context, model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, method, xhr, attributes = this.attributes, wait;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options = _.extend({validate: true}, options);
      wait = options.wait;

      // If we're not waiting and attributes exist, save acts as
      // `set(attr).save(null, opts)` with validation. Otherwise, check if
      // the model will be valid when the attributes, if any, are set.
      if (attrs && !wait) {
        if (!this.set(attrs, options)) return false;
      } else {
        if (!this._validate(attrs, options)) return false;
      }

      // Set temporary attributes if `{wait: true}`.
      if (attrs && wait) {
        this.attributes = _.extend({}, attributes, attrs);
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = options.parse ? model.parse(resp, options) : resp;
        if (wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (_.isObject(serverAttrs) && !model.set(serverAttrs, options)) {
          return false;
        }
        if (success) success.call(options.context, model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch' && !options.attrs) options.attrs = attrs;
      xhr = this.sync(method, this, options);

      // Restore attributes.
      if (attrs && wait) this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;
      var wait = options.wait;

      var destroy = function() {
        model.stopListening();
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (wait) destroy();
        if (success) success.call(options.context, model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      var xhr = false;
      if (this.isNew()) {
        _.defer(options.success);
      } else {
        wrapError(this, options);
        xhr = this.sync('delete', this, options);
      }
      if (!wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base =
          _.result(this, 'urlRoot') ||
          _.result(this.collection, 'url') ||
          urlError();
      if (this.isNew()) return base;
      var id = this.id || this.attributes[this.idAttribute];
      return base.replace(/([^\/])$/, '$1/') + encodeURIComponent(id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return !this.has(this.idAttribute);
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model.
  var modelMethods = { keys: 1, values: 1, pairs: 1, invert: 1, pick: 0,
    omit: 0, chain: 1, isEmpty: 1 };

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  addUnderscoreMethods(Model, modelMethods, 'attributes');

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analogous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, remove: false};

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
      return this.set(models, _.extend({merge: false}, options, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      var singular = !_.isArray(models), removed;
      models = singular ? [models] : _.clone(models);
      options || (options = {});
      removed = this._removeModels(models, options);
      if (!options.silent && removed) this.trigger('update', this, options);
      return singular ? models[0] : models;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      options = _.defaults({}, options, setOptions);
      if (options.parse) models = this.parse(models, options);
      var singular = !_.isArray(models);
      models = singular ? (models ? [models] : []) : models.slice();
      var id, model, attrs, existing, sort;
      var at = options.at;
      if (at != null) at = +at;
      if (at < 0) at += this.length + 1;
      var sortable = this.comparator && (at == null) && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;
      var toAdd = [], toRemove = [], modelMap = {};
      var add = options.add, merge = options.merge, remove = options.remove;
      var order = !sortable && add && remove ? [] : false;
      var orderChanged = false;

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (var i = 0; i < models.length; i++) {
        attrs = models[i];

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing = this.get(attrs)) {
          if (remove) modelMap[existing.cid] = true;
          if (merge && attrs !== existing) {
            attrs = this._isModel(attrs) ? attrs.attributes : attrs;
            if (options.parse) attrs = existing.parse(attrs, options);
            existing.set(attrs, options);
            if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
          }
          models[i] = existing;

          // If this is a new, valid model, push it to the `toAdd` list.
        } else if (add) {
          model = models[i] = this._prepareModel(attrs, options);
          if (!model) continue;
          toAdd.push(model);
          this._addReference(model, options);
        }

        // Do not add multiple models with the same `id`.
        model = existing || model;
        if (!model) continue;
        id = this.modelId(model.attributes);
        if (order && (model.isNew() || !modelMap[id])) {
          order.push(model);

          // Check to see if this is actually a new model at this index.
          orderChanged = orderChanged || !this.models[i] || model.cid !== this.models[i].cid;
        }

        modelMap[id] = true;
      }

      // Remove nonexistent models if appropriate.
      if (remove) {
        for (var i = 0; i < this.length; i++) {
          if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
        }
        if (toRemove.length) this._removeModels(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (toAdd.length || orderChanged) {
        if (sortable) sort = true;
        this.length += toAdd.length;
        if (at != null) {
          for (var i = 0; i < toAdd.length; i++) {
            this.models.splice(at + i, 0, toAdd[i]);
          }
        } else {
          if (order) this.models.length = 0;
          var orderedModels = order || toAdd;
          for (var i = 0; i < orderedModels.length; i++) {
            this.models.push(orderedModels[i]);
          }
        }
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      // Unless silenced, it's time to fire all appropriate add/sort events.
      if (!options.silent) {
        var addOpts = at != null ? _.clone(options) : options;
        for (var i = 0; i < toAdd.length; i++) {
          if (at != null) addOpts.index = at + i;
          (model = toAdd[i]).trigger('add', model, this, addOpts);
        }
        if (sort || orderChanged) this.trigger('sort', this, options);
        if (toAdd.length || toRemove.length) this.trigger('update', this, options);
      }

      // Return the added (or merged) model (or models).
      return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options = options ? _.clone(options) : {};
      for (var i = 0; i < this.models.length; i++) {
        this._removeReference(this.models[i], options);
      }
      options.previousModels = this.models;
      this._reset();
      models = this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      return this.add(model, _.extend({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      return this.add(model, _.extend({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
      return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      var id = this.modelId(this._isModel(obj) ? obj.attributes : obj);
      return this._byId[obj] || this._byId[id] || this._byId[obj.cid];
    },

    // Get the model at the given index.
    at: function(index) {
      if (index < 0) index += this.length;
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      var matches = _.matches(attrs);
      return this[first ? 'find' : 'filter'](function(model) {
        return matches(model.attributes);
      });
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      // Run sort based on type of `comparator`.
      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success.call(options.context, collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      var wait = options.wait;
      if (!(model = this._prepareModel(model, options))) return false;
      if (!wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(model, resp, callbackOpts) {
        if (wait) collection.add(model, callbackOpts);
        if (success) success.call(callbackOpts.context, model, resp, callbackOpts);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models, {
        model: this.model,
        comparator: this.comparator
      });
    },

    // Define how to uniquely identify models in the collection.
    modelId: function (attrs) {
      return attrs[this.model.prototype.idAttribute || 'id'];
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (this._isModel(attrs)) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options = options ? _.clone(options) : {};
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model.validationError) return model;
      this.trigger('invalid', this, model.validationError, options);
      return false;
    },

    // Internal method called by both remove and set. Does not trigger any
    // additional events. Returns true if anything was actually removed.
    _removeModels: function(models, options) {
      var i, l, index, model, removed = false;
      for (var i = 0, j = 0; i < models.length; i++) {
        var model = models[i] = this.get(models[i]);
        if (!model) continue;
        var id = this.modelId(model.attributes);
        if (id != null) delete this._byId[id];
        delete this._byId[model.cid];
        var index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        models[j++] = model;
        this._removeReference(model, options);
        removed = true;
      }
      // We only need to slice if models array should be smaller, which is
      // caused by some models not actually getting removed.
      if (models.length !== j) models = models.slice(0, j);
      return removed;
    },

    // Method for checking whether an object should be considered a model for
    // the purposes of adding to the collection.
    _isModel: function (model) {
      return model instanceof Model;
    },

    // Internal method to create a model's ties to a collection.
    _addReference: function(model, options) {
      this._byId[model.cid] = model;
      var id = this.modelId(model.attributes);
      if (id != null) this._byId[id] = model;
      model.on('all', this._onModelEvent, this);
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model, options) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (event === 'change') {
        var prevId = this.modelId(model.previousAttributes());
        var id = this.modelId(model.attributes);
        if (prevId !== id) {
          if (prevId != null) delete this._byId[prevId];
          if (id != null) this._byId[id] = model;
        }
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var collectionMethods = { forEach: 3, each: 3, map: 3, collect: 3, reduce: 4,
    foldl: 4, inject: 4, reduceRight: 4, foldr: 4, find: 3, detect: 3, filter: 3,
    select: 3, reject: 3, every: 3, all: 3, some: 3, any: 3, include: 2,
    contains: 2, invoke: 2, max: 3, min: 3, toArray: 1, size: 1, first: 3,
    head: 3, take: 3, initial: 3, rest: 3, tail: 3, drop: 3, last: 3,
    without: 0, difference: 0, indexOf: 3, shuffle: 1, lastIndexOf: 3,
    isEmpty: 1, chain: 1, sample: 3, partition: 3 };

  // Mix in each Underscore method as a proxy to `Collection#models`.
  addUnderscoreMethods(Collection, collectionMethods, 'models');

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy', 'indexBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    if (!_[method]) return;
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    options || (options = {});
    _.extend(this, _.pick(options, viewOptions));
    this._ensureElement();
    this.initialize.apply(this, arguments);
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be preferred to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this._removeElement();
      this.stopListening();
      return this;
    },

    // Remove this view's element from the document and all event listeners
    // attached to it. Exposed for subclasses using an alternative DOM
    // manipulation API.
    _removeElement: function() {
      this.$el.remove();
    },

    // Change the view's element (`this.el` property) and re-delegate the
    // view's events on the new element.
    setElement: function(element) {
      this.undelegateEvents();
      this._setElement(element);
      this.delegateEvents();
      return this;
    },

    // Creates the `this.el` and `this.$el` references for this view using the
    // given `el`. `el` can be a CSS selector or an HTML string, a jQuery
    // context or an element. Subclasses can override this to utilize an
    // alternative DOM manipulation API and are only required to set the
    // `this.el` property.
    _setElement: function(el) {
      this.$el = el instanceof Backbone.$ ? el : Backbone.$(el);
      this.el = this.$el[0];
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) continue;
        var match = key.match(delegateEventSplitter);
        this.delegate(match[1], match[2], _.bind(method, this));
      }
      return this;
    },

    // Add a single event listener to the view's element (or a child element
    // using `selector`). This only works for delegate-able events: not `focus`,
    // `blur`, and not `change`, `submit`, and `reset` in Internet Explorer.
    delegate: function(eventName, selector, listener) {
      this.$el.on(eventName + '.delegateEvents' + this.cid, selector, listener);
    },

    // Clears all callbacks previously bound to the view by `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      if (this.$el) this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // A finer-grained `undelegateEvents` for removing a single delegated event.
    // `selector` and `listener` are both optional.
    undelegate: function(eventName, selector, listener) {
      this.$el.off(eventName + '.delegateEvents' + this.cid, selector, listener);
    },

    // Produces a DOM element to be assigned to your view. Exposed for
    // subclasses using an alternative DOM manipulation API.
    _createElement: function(tagName) {
      return document.createElement(tagName);
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        this.setElement(this._createElement(_.result(this, 'tagName')));
        this._setAttributes(attrs);
      } else {
        this.setElement(_.result(this, 'el'));
      }
    },

    // Set attributes from a hash on this view's element.  Exposed for
    // subclasses using an alternative DOM manipulation API.
    _setAttributes: function(attributes) {
      this.$el.attr(attributes);
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // Pass along `textStatus` and `errorThrown` from jQuery.
    var error = options.error;
    options.error = function(xhr, textStatus, errorThrown) {
      options.textStatus = textStatus;
      options.errorThrown = errorThrown;
      if (error) error.call(options.context, xhr, textStatus, errorThrown);
    };

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        if (router.execute(callback, args, name) !== false) {
          router.trigger.apply(router, ['route:' + name].concat(args));
          router.trigger('route', name, args);
          Backbone.history.trigger('route', router, name, args);
        }
      });
      return this;
    },

    // Execute a route handler with the provided parameters.  This is an
    // excellent place to do pre-route setup or post-route cleanup.
    execute: function(callback, args, name) {
      if (callback) callback.apply(this, args);
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
          .replace(optionalParam, '(?:$1)?')
          .replace(namedParam, function(match, optional) {
            return optional ? match : '([^/?]+)';
          })
          .replace(splatParam, '([^?]*?)');
      return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param, i) {
        // Don't decode the search params.
        if (i === params.length - 1) return param || null;
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for stripping urls of hash.
  var pathStripper = /#.*$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Are we at the app root?
    atRoot: function() {
      var path = this.location.pathname.replace(/[^\/]$/, '$&/');
      return path === this.root && !this.getSearch();
    },

    // Does the pathname match the root?
    matchRoot: function() {
      var path = this.decodeFragment(this.location.pathname);
      var root = path.slice(0, this.root.length - 1) + '/';
      return root === this.root;
    },

    // Unicode characters in `location.pathname` are percent encoded so they're
    // decoded for comparison. `%25` should not be decoded since it may be part
    // of an encoded parameter.
    decodeFragment: function(fragment) {
      return decodeURI(fragment.replace(/%25/g, '%2525'));
    },

    // In IE6, the hash fragment and search params are incorrect if the
    // fragment contains `?`.
    getSearch: function() {
      var match = this.location.href.replace(/#.*/, '').match(/\?.+/);
      return match ? match[0] : '';
    },

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      //var match = (window || this).location.href.match(/#(.*)$/);
      //return match ? match[1] : '';
      var match = null;
      try {
        match = window.location.href.match(/#(.*)$/);
      } catch(err) {
        match = this.location.href.match(/#(.*)$/);
      }
      return match ? match[1] : '';
    },

    // Get the pathname and search params, without the root.
    getPath: function() {
      var path = this.decodeFragment(
          this.location.pathname + this.getSearch()
      ).slice(this.root.length - 1);
      return path.charAt(0) === '/' ? path.slice(1) : path;
    },

    // Get the cross-browser normalized URL fragment from the path or hash.
    getFragment: function(fragment) {
      if (fragment == null) {
        if (this._usePushState || !this._wantsHashChange) {
          fragment = this.getPath();
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error('Backbone.history has already been started');
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._hasHashChange   = 'onhashchange' in window;
      this._useHashChange   = this._wantsHashChange && this._hasHashChange;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.history && this.history.pushState);
      this._usePushState    = this._wantsPushState && this._hasPushState;
      this.fragment         = this.getFragment();

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      // Transition from hashChange to pushState or vice versa if both are
      // requested.
      if (this._wantsHashChange && this._wantsPushState) {

        // If we've started off with a route from a `pushState`-enabled
        // browser, but we're currently in a browser that doesn't support it...
        if (!this._hasPushState && !this.atRoot()) {
          var root = this.root.slice(0, -1) || '/';
          this.location.replace(root + '#' + this.getPath());
          // Return immediately as browser will do redirect to new url
          return true;

          // Or if we've started out with a hash-based route, but we're currently
          // in a browser where it could be `pushState`-based instead...
        } else if (this._hasPushState && this.atRoot()) {
          this.navigate(this.getHash(), {replace: true});
        }

      }

      // Proxy an iframe to handle location events if the browser doesn't
      // support the `hashchange` event, HTML5 history, or the user wants
      // `hashChange` but not `pushState`.
      if (!this._hasHashChange && this._wantsHashChange && !this._usePushState) {
        var iframe = document.createElement('iframe');
        iframe.src = 'javascript:0';
        iframe.style.display = 'none';
        iframe.tabIndex = -1;
        var body = document.body;
        // Using `appendChild` will throw on IE < 9 if the document is not ready.
        this.iframe = body.insertBefore(iframe, body.firstChild).contentWindow;
        this.iframe.document.open().close();
        this.iframe.location.hash = '#' + this.fragment;
      }

      // Add a cross-platform `addEventListener` shim for older browsers.
      var addEventListener = window.addEventListener || function (eventName, listener) {
            return attachEvent('on' + eventName, listener);
          };

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._usePushState) {
        addEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        addEventListener('hashchange', this.checkUrl, false);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      // Add a cross-platform `removeEventListener` shim for older browsers.
      var removeEventListener = window.removeEventListener || function (eventName, listener) {
            return detachEvent('on' + eventName, listener);
          };

      // Remove window listeners.
      if (this._usePushState) {
        removeEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        removeEventListener('hashchange', this.checkUrl, false);
      }

      // Clean up the iframe if necessary.
      if (this.iframe) {
        document.body.removeChild(this.iframe.frameElement);
        this.iframe = null;
      }

      // Some environments will throw when clearing an undefined interval.
      if (this._checkUrlInterval) clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();

      // If the user pressed the back button, the iframe's hash will have
      // changed and we should use that for comparison.
      if (current === this.fragment && this.iframe) {
        current = this.getHash(this.iframe);
      }

      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl();
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragment) {
      // If the root doesn't match, no routes can match either.
      if (!this.matchRoot()) return false;
      fragment = this.fragment = this.getFragment(fragment);
      return _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: !!options};

      // Normalize the fragment.
      fragment = this.getFragment(fragment || '');

      // Don't include a trailing slash on the root.
      var root = this.root;
      if (fragment === '' || fragment.charAt(0) === '?') {
        root = root.slice(0, -1) || '/';
      }
      var url = root + fragment;

      // Strip the hash and decode for matching.
      fragment = this.decodeFragment(fragment.replace(pathStripper, ''));

      if (this.fragment === fragment) return;
      this.fragment = fragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._usePushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

        // If hash changes haven't been explicitly disabled, update the hash
        // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getHash(this.iframe))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if (!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

        // If you've told us that you explicitly don't want fallback hashchange-
        // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) return this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent` constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function(model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error.call(options.context, model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

  return Backbone;

}));
/*!
 * Bootstrap v3.3.4 (http://getbootstrap.com)
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 */
if("undefined"==typeof jQuery)throw new Error("Bootstrap's JavaScript requires jQuery");+function(a){var b=a.fn.jquery.split(" ")[0].split(".");if(b[0]<2&&b[1]<9||1==b[0]&&9==b[1]&&b[2]<1)throw new Error("Bootstrap's JavaScript requires jQuery version 1.9.1 or higher")}(jQuery),+function(a){function b(){var a=document.createElement("bootstrap"),b={WebkitTransition:"webkitTransitionEnd",MozTransition:"transitionend",OTransition:"oTransitionEnd otransitionend",transition:"transitionend"};for(var c in b)if(void 0!==a.style[c])return{end:b[c]};return!1}a.fn.emulateTransitionEnd=function(b){var c=!1,d=this;a(this).one("bsTransitionEnd",function(){c=!0});var e=function(){c||a(d).trigger(a.support.transition.end)};return setTimeout(e,b),this},a(function(){a.support.transition=b(),a.support.transition&&(a.event.special.bsTransitionEnd={bindType:a.support.transition.end,delegateType:a.support.transition.end,handle:function(b){return a(b.target).is(this)?b.handleObj.handler.apply(this,arguments):void 0}})})}(jQuery),+function(a){function b(b){return this.each(function(){var c=a(this),e=c.data("bs.alert");e||c.data("bs.alert",e=new d(this)),"string"==typeof b&&e[b].call(c)})}var c='[data-dismiss="alert"]',d=function(b){a(b).on("click",c,this.close)};d.VERSION="3.3.4",d.TRANSITION_DURATION=150,d.prototype.close=function(b){function c(){g.detach().trigger("closed.bs.alert").remove()}var e=a(this),f=e.attr("data-target");f||(f=e.attr("href"),f=f&&f.replace(/.*(?=#[^\s]*$)/,""));var g=a(f);b&&b.preventDefault(),g.length||(g=e.closest(".alert")),g.trigger(b=a.Event("close.bs.alert")),b.isDefaultPrevented()||(g.removeClass("in"),a.support.transition&&g.hasClass("fade")?g.one("bsTransitionEnd",c).emulateTransitionEnd(d.TRANSITION_DURATION):c())};var e=a.fn.alert;a.fn.alert=b,a.fn.alert.Constructor=d,a.fn.alert.noConflict=function(){return a.fn.alert=e,this},a(document).on("click.bs.alert.data-api",c,d.prototype.close)}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.button"),f="object"==typeof b&&b;e||d.data("bs.button",e=new c(this,f)),"toggle"==b?e.toggle():b&&e.setState(b)})}var c=function(b,d){this.$element=a(b),this.options=a.extend({},c.DEFAULTS,d),this.isLoading=!1};c.VERSION="3.3.4",c.DEFAULTS={loadingText:"loading..."},c.prototype.setState=function(b){var c="disabled",d=this.$element,e=d.is("input")?"val":"html",f=d.data();b+="Text",null==f.resetText&&d.data("resetText",d[e]()),setTimeout(a.proxy(function(){d[e](null==f[b]?this.options[b]:f[b]),"loadingText"==b?(this.isLoading=!0,d.addClass(c).attr(c,c)):this.isLoading&&(this.isLoading=!1,d.removeClass(c).removeAttr(c))},this),0)},c.prototype.toggle=function(){var a=!0,b=this.$element.closest('[data-toggle="buttons"]');if(b.length){var c=this.$element.find("input");"radio"==c.prop("type")&&(c.prop("checked")&&this.$element.hasClass("active")?a=!1:b.find(".active").removeClass("active")),a&&c.prop("checked",!this.$element.hasClass("active")).trigger("change")}else this.$element.attr("aria-pressed",!this.$element.hasClass("active"));a&&this.$element.toggleClass("active")};var d=a.fn.button;a.fn.button=b,a.fn.button.Constructor=c,a.fn.button.noConflict=function(){return a.fn.button=d,this},a(document).on("click.bs.button.data-api",'[data-toggle^="button"]',function(c){var d=a(c.target);d.hasClass("btn")||(d=d.closest(".btn")),b.call(d,"toggle"),c.preventDefault()}).on("focus.bs.button.data-api blur.bs.button.data-api",'[data-toggle^="button"]',function(b){a(b.target).closest(".btn").toggleClass("focus",/^focus(in)?$/.test(b.type))})}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.carousel"),f=a.extend({},c.DEFAULTS,d.data(),"object"==typeof b&&b),g="string"==typeof b?b:f.slide;e||d.data("bs.carousel",e=new c(this,f)),"number"==typeof b?e.to(b):g?e[g]():f.interval&&e.pause().cycle()})}var c=function(b,c){this.$element=a(b),this.$indicators=this.$element.find(".carousel-indicators"),this.options=c,this.paused=null,this.sliding=null,this.interval=null,this.$active=null,this.$items=null,this.options.keyboard&&this.$element.on("keydown.bs.carousel",a.proxy(this.keydown,this)),"hover"==this.options.pause&&!("ontouchstart"in document.documentElement)&&this.$element.on("mouseenter.bs.carousel",a.proxy(this.pause,this)).on("mouseleave.bs.carousel",a.proxy(this.cycle,this))};c.VERSION="3.3.4",c.TRANSITION_DURATION=600,c.DEFAULTS={interval:5e3,pause:"hover",wrap:!0,keyboard:!0},c.prototype.keydown=function(a){if(!/input|textarea/i.test(a.target.tagName)){switch(a.which){case 37:this.prev();break;case 39:this.next();break;default:return}a.preventDefault()}},c.prototype.cycle=function(b){return b||(this.paused=!1),this.interval&&clearInterval(this.interval),this.options.interval&&!this.paused&&(this.interval=setInterval(a.proxy(this.next,this),this.options.interval)),this},c.prototype.getItemIndex=function(a){return this.$items=a.parent().children(".item"),this.$items.index(a||this.$active)},c.prototype.getItemForDirection=function(a,b){var c=this.getItemIndex(b),d="prev"==a&&0===c||"next"==a&&c==this.$items.length-1;if(d&&!this.options.wrap)return b;var e="prev"==a?-1:1,f=(c+e)%this.$items.length;return this.$items.eq(f)},c.prototype.to=function(a){var b=this,c=this.getItemIndex(this.$active=this.$element.find(".item.active"));return a>this.$items.length-1||0>a?void 0:this.sliding?this.$element.one("slid.bs.carousel",function(){b.to(a)}):c==a?this.pause().cycle():this.slide(a>c?"next":"prev",this.$items.eq(a))},c.prototype.pause=function(b){return b||(this.paused=!0),this.$element.find(".next, .prev").length&&a.support.transition&&(this.$element.trigger(a.support.transition.end),this.cycle(!0)),this.interval=clearInterval(this.interval),this},c.prototype.next=function(){return this.sliding?void 0:this.slide("next")},c.prototype.prev=function(){return this.sliding?void 0:this.slide("prev")},c.prototype.slide=function(b,d){var e=this.$element.find(".item.active"),f=d||this.getItemForDirection(b,e),g=this.interval,h="next"==b?"left":"right",i=this;if(f.hasClass("active"))return this.sliding=!1;var j=f[0],k=a.Event("slide.bs.carousel",{relatedTarget:j,direction:h});if(this.$element.trigger(k),!k.isDefaultPrevented()){if(this.sliding=!0,g&&this.pause(),this.$indicators.length){this.$indicators.find(".active").removeClass("active");var l=a(this.$indicators.children()[this.getItemIndex(f)]);l&&l.addClass("active")}var m=a.Event("slid.bs.carousel",{relatedTarget:j,direction:h});return a.support.transition&&this.$element.hasClass("slide")?(f.addClass(b),f[0].offsetWidth,e.addClass(h),f.addClass(h),e.one("bsTransitionEnd",function(){f.removeClass([b,h].join(" ")).addClass("active"),e.removeClass(["active",h].join(" ")),i.sliding=!1,setTimeout(function(){i.$element.trigger(m)},0)}).emulateTransitionEnd(c.TRANSITION_DURATION)):(e.removeClass("active"),f.addClass("active"),this.sliding=!1,this.$element.trigger(m)),g&&this.cycle(),this}};var d=a.fn.carousel;a.fn.carousel=b,a.fn.carousel.Constructor=c,a.fn.carousel.noConflict=function(){return a.fn.carousel=d,this};var e=function(c){var d,e=a(this),f=a(e.attr("data-target")||(d=e.attr("href"))&&d.replace(/.*(?=#[^\s]+$)/,""));if(f.hasClass("carousel")){var g=a.extend({},f.data(),e.data()),h=e.attr("data-slide-to");h&&(g.interval=!1),b.call(f,g),h&&f.data("bs.carousel").to(h),c.preventDefault()}};a(document).on("click.bs.carousel.data-api","[data-slide]",e).on("click.bs.carousel.data-api","[data-slide-to]",e),a(window).on("load",function(){a('[data-ride="carousel"]').each(function(){var c=a(this);b.call(c,c.data())})})}(jQuery),+function(a){function b(b){var c,d=b.attr("data-target")||(c=b.attr("href"))&&c.replace(/.*(?=#[^\s]+$)/,"");return a(d)}function c(b){return this.each(function(){var c=a(this),e=c.data("bs.collapse"),f=a.extend({},d.DEFAULTS,c.data(),"object"==typeof b&&b);!e&&f.toggle&&/show|hide/.test(b)&&(f.toggle=!1),e||c.data("bs.collapse",e=new d(this,f)),"string"==typeof b&&e[b]()})}var d=function(b,c){this.$element=a(b),this.options=a.extend({},d.DEFAULTS,c),this.$trigger=a('[data-toggle="collapse"][href="#'+b.id+'"],[data-toggle="collapse"][data-target="#'+b.id+'"]'),this.transitioning=null,this.options.parent?this.$parent=this.getParent():this.addAriaAndCollapsedClass(this.$element,this.$trigger),this.options.toggle&&this.toggle()};d.VERSION="3.3.4",d.TRANSITION_DURATION=350,d.DEFAULTS={toggle:!0},d.prototype.dimension=function(){var a=this.$element.hasClass("width");return a?"width":"height"},d.prototype.show=function(){if(!this.transitioning&&!this.$element.hasClass("in")){var b,e=this.$parent&&this.$parent.children(".panel").children(".in, .collapsing");if(!(e&&e.length&&(b=e.data("bs.collapse"),b&&b.transitioning))){var f=a.Event("show.bs.collapse");if(this.$element.trigger(f),!f.isDefaultPrevented()){e&&e.length&&(c.call(e,"hide"),b||e.data("bs.collapse",null));var g=this.dimension();this.$element.removeClass("collapse").addClass("collapsing")[g](0).attr("aria-expanded",!0),this.$trigger.removeClass("collapsed").attr("aria-expanded",!0),this.transitioning=1;var h=function(){this.$element.removeClass("collapsing").addClass("collapse in")[g](""),this.transitioning=0,this.$element.trigger("shown.bs.collapse")};if(!a.support.transition)return h.call(this);var i=a.camelCase(["scroll",g].join("-"));this.$element.one("bsTransitionEnd",a.proxy(h,this)).emulateTransitionEnd(d.TRANSITION_DURATION)[g](this.$element[0][i])}}}},d.prototype.hide=function(){if(!this.transitioning&&this.$element.hasClass("in")){var b=a.Event("hide.bs.collapse");if(this.$element.trigger(b),!b.isDefaultPrevented()){var c=this.dimension();this.$element[c](this.$element[c]())[0].offsetHeight,this.$element.addClass("collapsing").removeClass("collapse in").attr("aria-expanded",!1),this.$trigger.addClass("collapsed").attr("aria-expanded",!1),this.transitioning=1;var e=function(){this.transitioning=0,this.$element.removeClass("collapsing").addClass("collapse").trigger("hidden.bs.collapse")};return a.support.transition?void this.$element[c](0).one("bsTransitionEnd",a.proxy(e,this)).emulateTransitionEnd(d.TRANSITION_DURATION):e.call(this)}}},d.prototype.toggle=function(){this[this.$element.hasClass("in")?"hide":"show"]()},d.prototype.getParent=function(){return a(this.options.parent).find('[data-toggle="collapse"][data-parent="'+this.options.parent+'"]').each(a.proxy(function(c,d){var e=a(d);this.addAriaAndCollapsedClass(b(e),e)},this)).end()},d.prototype.addAriaAndCollapsedClass=function(a,b){var c=a.hasClass("in");a.attr("aria-expanded",c),b.toggleClass("collapsed",!c).attr("aria-expanded",c)};var e=a.fn.collapse;a.fn.collapse=c,a.fn.collapse.Constructor=d,a.fn.collapse.noConflict=function(){return a.fn.collapse=e,this},a(document).on("click.bs.collapse.data-api",'[data-toggle="collapse"]',function(d){var e=a(this);e.attr("data-target")||d.preventDefault();var f=b(e),g=f.data("bs.collapse"),h=g?"toggle":e.data();c.call(f,h)})}(jQuery),+function(a){function b(b){b&&3===b.which||(a(e).remove(),a(f).each(function(){var d=a(this),e=c(d),f={relatedTarget:this};e.hasClass("open")&&(e.trigger(b=a.Event("hide.bs.dropdown",f)),b.isDefaultPrevented()||(d.attr("aria-expanded","false"),e.removeClass("open").trigger("hidden.bs.dropdown",f)))}))}function c(b){var c=b.attr("data-target");c||(c=b.attr("href"),c=c&&/#[A-Za-z]/.test(c)&&c.replace(/.*(?=#[^\s]*$)/,""));var d=c&&a(c);return d&&d.length?d:b.parent()}function d(b){return this.each(function(){var c=a(this),d=c.data("bs.dropdown");d||c.data("bs.dropdown",d=new g(this)),"string"==typeof b&&d[b].call(c)})}var e=".dropdown-backdrop",f='[data-toggle="dropdown"]',g=function(b){a(b).on("click.bs.dropdown",this.toggle)};g.VERSION="3.3.4",g.prototype.toggle=function(d){var e=a(this);if(!e.is(".disabled, :disabled")){var f=c(e),g=f.hasClass("open");if(b(),!g){"ontouchstart"in document.documentElement&&!f.closest(".navbar-nav").length&&a('<div class="dropdown-backdrop"/>').insertAfter(a(this)).on("click",b);var h={relatedTarget:this};if(f.trigger(d=a.Event("show.bs.dropdown",h)),d.isDefaultPrevented())return;e.trigger("focus").attr("aria-expanded","true"),f.toggleClass("open").trigger("shown.bs.dropdown",h)}return!1}},g.prototype.keydown=function(b){if(/(38|40|27|32)/.test(b.which)&&!/input|textarea/i.test(b.target.tagName)){var d=a(this);if(b.preventDefault(),b.stopPropagation(),!d.is(".disabled, :disabled")){var e=c(d),g=e.hasClass("open");if(!g&&27!=b.which||g&&27==b.which)return 27==b.which&&e.find(f).trigger("focus"),d.trigger("click");var h=" li:not(.disabled):visible a",i=e.find('[role="menu"]'+h+', [role="listbox"]'+h);if(i.length){var j=i.index(b.target);38==b.which&&j>0&&j--,40==b.which&&j<i.length-1&&j++,~j||(j=0),i.eq(j).trigger("focus")}}}};var h=a.fn.dropdown;a.fn.dropdown=d,a.fn.dropdown.Constructor=g,a.fn.dropdown.noConflict=function(){return a.fn.dropdown=h,this},a(document).on("click.bs.dropdown.data-api",b).on("click.bs.dropdown.data-api",".dropdown form",function(a){a.stopPropagation()}).on("click.bs.dropdown.data-api",f,g.prototype.toggle).on("keydown.bs.dropdown.data-api",f,g.prototype.keydown).on("keydown.bs.dropdown.data-api",'[role="menu"]',g.prototype.keydown).on("keydown.bs.dropdown.data-api",'[role="listbox"]',g.prototype.keydown)}(jQuery),+function(a){function b(b,d){return this.each(function(){var e=a(this),f=e.data("bs.modal"),g=a.extend({},c.DEFAULTS,e.data(),"object"==typeof b&&b);f||e.data("bs.modal",f=new c(this,g)),"string"==typeof b?f[b](d):g.show&&f.show(d)})}var c=function(b,c){this.options=c,this.$body=a(document.body),this.$element=a(b),this.$dialog=this.$element.find(".modal-dialog"),this.$backdrop=null,this.isShown=null,this.originalBodyPad=null,this.scrollbarWidth=0,this.ignoreBackdropClick=!1,this.options.remote&&this.$element.find(".modal-content").load(this.options.remote,a.proxy(function(){this.$element.trigger("loaded.bs.modal")},this))};c.VERSION="3.3.4",c.TRANSITION_DURATION=300,c.BACKDROP_TRANSITION_DURATION=150,c.DEFAULTS={backdrop:!0,keyboard:!0,show:!0},c.prototype.toggle=function(a){return this.isShown?this.hide():this.show(a)},c.prototype.show=function(b){var d=this,e=a.Event("show.bs.modal",{relatedTarget:b});this.$element.trigger(e),this.isShown||e.isDefaultPrevented()||(this.isShown=!0,this.checkScrollbar(),this.setScrollbar(),this.$body.addClass("modal-open"),this.escape(),this.resize(),this.$element.on("click.dismiss.bs.modal",'[data-dismiss="modal"]',a.proxy(this.hide,this)),this.$dialog.on("mousedown.dismiss.bs.modal",function(){d.$element.one("mouseup.dismiss.bs.modal",function(b){a(b.target).is(d.$element)&&(d.ignoreBackdropClick=!0)})}),this.backdrop(function(){var e=a.support.transition&&d.$element.hasClass("fade");d.$element.parent().length||d.$element.appendTo(d.$body),d.$element.show().scrollTop(0),d.adjustDialog(),e&&d.$element[0].offsetWidth,d.$element.addClass("in").attr("aria-hidden",!1),d.enforceFocus();var f=a.Event("shown.bs.modal",{relatedTarget:b});e?d.$dialog.one("bsTransitionEnd",function(){d.$element.trigger("focus").trigger(f)}).emulateTransitionEnd(c.TRANSITION_DURATION):d.$element.trigger("focus").trigger(f)}))},c.prototype.hide=function(b){b&&b.preventDefault(),b=a.Event("hide.bs.modal"),this.$element.trigger(b),this.isShown&&!b.isDefaultPrevented()&&(this.isShown=!1,this.escape(),this.resize(),a(document).off("focusin.bs.modal"),this.$element.removeClass("in").attr("aria-hidden",!0).off("click.dismiss.bs.modal").off("mouseup.dismiss.bs.modal"),this.$dialog.off("mousedown.dismiss.bs.modal"),a.support.transition&&this.$element.hasClass("fade")?this.$element.one("bsTransitionEnd",a.proxy(this.hideModal,this)).emulateTransitionEnd(c.TRANSITION_DURATION):this.hideModal())},c.prototype.enforceFocus=function(){a(document).off("focusin.bs.modal").on("focusin.bs.modal",a.proxy(function(a){this.$element[0]===a.target||this.$element.has(a.target).length||this.$element.trigger("focus")},this))},c.prototype.escape=function(){this.isShown&&this.options.keyboard?this.$element.on("keydown.dismiss.bs.modal",a.proxy(function(a){27==a.which&&this.hide()},this)):this.isShown||this.$element.off("keydown.dismiss.bs.modal")},c.prototype.resize=function(){this.isShown?a(window).on("resize.bs.modal",a.proxy(this.handleUpdate,this)):a(window).off("resize.bs.modal")},c.prototype.hideModal=function(){var a=this;this.$element.hide(),this.backdrop(function(){a.$body.removeClass("modal-open"),a.resetAdjustments(),a.resetScrollbar(),a.$element.trigger("hidden.bs.modal")})},c.prototype.removeBackdrop=function(){this.$backdrop&&this.$backdrop.remove(),this.$backdrop=null},c.prototype.backdrop=function(b){var d=this,e=this.$element.hasClass("fade")?"fade":"";if(this.isShown&&this.options.backdrop){var f=a.support.transition&&e;if(this.$backdrop=a('<div class="modal-backdrop '+e+'" />').appendTo(this.$body),this.$element.on("click.dismiss.bs.modal",a.proxy(function(a){return this.ignoreBackdropClick?void(this.ignoreBackdropClick=!1):void(a.target===a.currentTarget&&("static"==this.options.backdrop?this.$element[0].focus():this.hide()))},this)),f&&this.$backdrop[0].offsetWidth,this.$backdrop.addClass("in"),!b)return;f?this.$backdrop.one("bsTransitionEnd",b).emulateTransitionEnd(c.BACKDROP_TRANSITION_DURATION):b()}else if(!this.isShown&&this.$backdrop){this.$backdrop.removeClass("in");var g=function(){d.removeBackdrop(),b&&b()};a.support.transition&&this.$element.hasClass("fade")?this.$backdrop.one("bsTransitionEnd",g).emulateTransitionEnd(c.BACKDROP_TRANSITION_DURATION):g()}else b&&b()},c.prototype.handleUpdate=function(){this.adjustDialog()},c.prototype.adjustDialog=function(){var a=this.$element[0].scrollHeight>document.documentElement.clientHeight;this.$element.css({paddingLeft:!this.bodyIsOverflowing&&a?this.scrollbarWidth:"",paddingRight:this.bodyIsOverflowing&&!a?this.scrollbarWidth:""})},c.prototype.resetAdjustments=function(){this.$element.css({paddingLeft:"",paddingRight:""})},c.prototype.checkScrollbar=function(){var a=window.innerWidth;if(!a){var b=document.documentElement.getBoundingClientRect();a=b.right-Math.abs(b.left)}this.bodyIsOverflowing=document.body.clientWidth<a,this.scrollbarWidth=this.measureScrollbar()},c.prototype.setScrollbar=function(){var a=parseInt(this.$body.css("padding-right")||0,10);this.originalBodyPad=document.body.style.paddingRight||"",this.bodyIsOverflowing&&this.$body.css("padding-right",a+this.scrollbarWidth)},c.prototype.resetScrollbar=function(){this.$body.css("padding-right",this.originalBodyPad)},c.prototype.measureScrollbar=function(){var a=document.createElement("div");a.className="modal-scrollbar-measure",this.$body.append(a);var b=a.offsetWidth-a.clientWidth;return this.$body[0].removeChild(a),b};var d=a.fn.modal;a.fn.modal=b,a.fn.modal.Constructor=c,a.fn.modal.noConflict=function(){return a.fn.modal=d,this},a(document).on("click.bs.modal.data-api",'[data-toggle="modal"]',function(c){var d=a(this),e=d.attr("href"),f=a(d.attr("data-target")||e&&e.replace(/.*(?=#[^\s]+$)/,"")),g=f.data("bs.modal")?"toggle":a.extend({remote:!/#/.test(e)&&e},f.data(),d.data());d.is("a")&&c.preventDefault(),f.one("show.bs.modal",function(a){a.isDefaultPrevented()||f.one("hidden.bs.modal",function(){d.is(":visible")&&d.trigger("focus")})}),b.call(f,g,this)})}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.tooltip"),f="object"==typeof b&&b;(e||!/destroy|hide/.test(b))&&(e||d.data("bs.tooltip",e=new c(this,f)),"string"==typeof b&&e[b]())})}var c=function(a,b){this.type=null,this.options=null,this.enabled=null,this.timeout=null,this.hoverState=null,this.$element=null,this.init("tooltip",a,b)};c.VERSION="3.3.4",c.TRANSITION_DURATION=150,c.DEFAULTS={animation:!0,placement:"top",selector:!1,template:'<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',trigger:"hover focus",title:"",delay:0,html:!1,container:!1,viewport:{selector:"body",padding:0}},c.prototype.init=function(b,c,d){if(this.enabled=!0,this.type=b,this.$element=a(c),this.options=this.getOptions(d),this.$viewport=this.options.viewport&&a(this.options.viewport.selector||this.options.viewport),this.$element[0]instanceof document.constructor&&!this.options.selector)throw new Error("`selector` option must be specified when initializing "+this.type+" on the window.document object!");for(var e=this.options.trigger.split(" "),f=e.length;f--;){var g=e[f];if("click"==g)this.$element.on("click."+this.type,this.options.selector,a.proxy(this.toggle,this));else if("manual"!=g){var h="hover"==g?"mouseenter":"focusin",i="hover"==g?"mouseleave":"focusout";this.$element.on(h+"."+this.type,this.options.selector,a.proxy(this.enter,this)),this.$element.on(i+"."+this.type,this.options.selector,a.proxy(this.leave,this))}}this.options.selector?this._options=a.extend({},this.options,{trigger:"manual",selector:""}):this.fixTitle()},c.prototype.getDefaults=function(){return c.DEFAULTS},c.prototype.getOptions=function(b){return b=a.extend({},this.getDefaults(),this.$element.data(),b),b.delay&&"number"==typeof b.delay&&(b.delay={show:b.delay,hide:b.delay}),b},c.prototype.getDelegateOptions=function(){var b={},c=this.getDefaults();return this._options&&a.each(this._options,function(a,d){c[a]!=d&&(b[a]=d)}),b},c.prototype.enter=function(b){var c=b instanceof this.constructor?b:a(b.currentTarget).data("bs."+this.type);return c&&c.$tip&&c.$tip.is(":visible")?void(c.hoverState="in"):(c||(c=new this.constructor(b.currentTarget,this.getDelegateOptions()),a(b.currentTarget).data("bs."+this.type,c)),clearTimeout(c.timeout),c.hoverState="in",c.options.delay&&c.options.delay.show?void(c.timeout=setTimeout(function(){"in"==c.hoverState&&c.show()},c.options.delay.show)):c.show())},c.prototype.leave=function(b){var c=b instanceof this.constructor?b:a(b.currentTarget).data("bs."+this.type);return c||(c=new this.constructor(b.currentTarget,this.getDelegateOptions()),a(b.currentTarget).data("bs."+this.type,c)),clearTimeout(c.timeout),c.hoverState="out",c.options.delay&&c.options.delay.hide?void(c.timeout=setTimeout(function(){"out"==c.hoverState&&c.hide()},c.options.delay.hide)):c.hide()},c.prototype.show=function(){var b=a.Event("show.bs."+this.type);if(this.hasContent()&&this.enabled){this.$element.trigger(b);var d=a.contains(this.$element[0].ownerDocument.documentElement,this.$element[0]);if(b.isDefaultPrevented()||!d)return;var e=this,f=this.tip(),g=this.getUID(this.type);this.setContent(),f.attr("id",g),this.$element.attr("aria-describedby",g),this.options.animation&&f.addClass("fade");var h="function"==typeof this.options.placement?this.options.placement.call(this,f[0],this.$element[0]):this.options.placement,i=/\s?auto?\s?/i,j=i.test(h);j&&(h=h.replace(i,"")||"top"),f.detach().css({top:0,left:0,display:"block"}).addClass(h).data("bs."+this.type,this),this.options.container?f.appendTo(this.options.container):f.insertAfter(this.$element);var k=this.getPosition(),l=f[0].offsetWidth,m=f[0].offsetHeight;if(j){var n=h,o=this.options.container?a(this.options.container):this.$element.parent(),p=this.getPosition(o);h="bottom"==h&&k.bottom+m>p.bottom?"top":"top"==h&&k.top-m<p.top?"bottom":"right"==h&&k.right+l>p.width?"left":"left"==h&&k.left-l<p.left?"right":h,f.removeClass(n).addClass(h)}var q=this.getCalculatedOffset(h,k,l,m);this.applyPlacement(q,h);var r=function(){var a=e.hoverState;e.$element.trigger("shown.bs."+e.type),e.hoverState=null,"out"==a&&e.leave(e)};a.support.transition&&this.$tip.hasClass("fade")?f.one("bsTransitionEnd",r).emulateTransitionEnd(c.TRANSITION_DURATION):r()}},c.prototype.applyPlacement=function(b,c){var d=this.tip(),e=d[0].offsetWidth,f=d[0].offsetHeight,g=parseInt(d.css("margin-top"),10),h=parseInt(d.css("margin-left"),10);isNaN(g)&&(g=0),isNaN(h)&&(h=0),b.top=b.top+g,b.left=b.left+h,a.offset.setOffset(d[0],a.extend({using:function(a){d.css({top:Math.round(a.top),left:Math.round(a.left)})}},b),0),d.addClass("in");var i=d[0].offsetWidth,j=d[0].offsetHeight;"top"==c&&j!=f&&(b.top=b.top+f-j);var k=this.getViewportAdjustedDelta(c,b,i,j);k.left?b.left+=k.left:b.top+=k.top;var l=/top|bottom/.test(c),m=l?2*k.left-e+i:2*k.top-f+j,n=l?"offsetWidth":"offsetHeight";d.offset(b),this.replaceArrow(m,d[0][n],l)},c.prototype.replaceArrow=function(a,b,c){this.arrow().css(c?"left":"top",50*(1-a/b)+"%").css(c?"top":"left","")},c.prototype.setContent=function(){var a=this.tip(),b=this.getTitle();a.find(".tooltip-inner")[this.options.html?"html":"text"](b),a.removeClass("fade in top bottom left right")},c.prototype.hide=function(b){function d(){"in"!=e.hoverState&&f.detach(),e.$element.removeAttr("aria-describedby").trigger("hidden.bs."+e.type),b&&b()}var e=this,f=a(this.$tip),g=a.Event("hide.bs."+this.type);return this.$element.trigger(g),g.isDefaultPrevented()?void 0:(f.removeClass("in"),a.support.transition&&f.hasClass("fade")?f.one("bsTransitionEnd",d).emulateTransitionEnd(c.TRANSITION_DURATION):d(),this.hoverState=null,this)},c.prototype.fixTitle=function(){var a=this.$element;(a.attr("title")||"string"!=typeof a.attr("data-original-title"))&&a.attr("data-original-title",a.attr("title")||"").attr("title","")},c.prototype.hasContent=function(){return this.getTitle()},c.prototype.getPosition=function(b){b=b||this.$element;var c=b[0],d="BODY"==c.tagName,e=c.getBoundingClientRect();null==e.width&&(e=a.extend({},e,{width:e.right-e.left,height:e.bottom-e.top}));var f=d?{top:0,left:0}:b.offset(),g={scroll:d?document.documentElement.scrollTop||document.body.scrollTop:b.scrollTop()},h=d?{width:a(window).width(),height:a(window).height()}:null;return a.extend({},e,g,h,f)},c.prototype.getCalculatedOffset=function(a,b,c,d){return"bottom"==a?{top:b.top+b.height,left:b.left+b.width/2-c/2}:"top"==a?{top:b.top-d,left:b.left+b.width/2-c/2}:"left"==a?{top:b.top+b.height/2-d/2,left:b.left-c}:{top:b.top+b.height/2-d/2,left:b.left+b.width}},c.prototype.getViewportAdjustedDelta=function(a,b,c,d){var e={top:0,left:0};if(!this.$viewport)return e;var f=this.options.viewport&&this.options.viewport.padding||0,g=this.getPosition(this.$viewport);if(/right|left/.test(a)){var h=b.top-f-g.scroll,i=b.top+f-g.scroll+d;h<g.top?e.top=g.top-h:i>g.top+g.height&&(e.top=g.top+g.height-i)}else{var j=b.left-f,k=b.left+f+c;j<g.left?e.left=g.left-j:k>g.width&&(e.left=g.left+g.width-k)}return e},c.prototype.getTitle=function(){var a,b=this.$element,c=this.options;return a=b.attr("data-original-title")||("function"==typeof c.title?c.title.call(b[0]):c.title)},c.prototype.getUID=function(a){do a+=~~(1e6*Math.random());while(document.getElementById(a));return a},c.prototype.tip=function(){return this.$tip=this.$tip||a(this.options.template)},c.prototype.arrow=function(){return this.$arrow=this.$arrow||this.tip().find(".tooltip-arrow")},c.prototype.enable=function(){this.enabled=!0},c.prototype.disable=function(){this.enabled=!1},c.prototype.toggleEnabled=function(){this.enabled=!this.enabled},c.prototype.toggle=function(b){var c=this;b&&(c=a(b.currentTarget).data("bs."+this.type),c||(c=new this.constructor(b.currentTarget,this.getDelegateOptions()),a(b.currentTarget).data("bs."+this.type,c))),c.tip().hasClass("in")?c.leave(c):c.enter(c)},c.prototype.destroy=function(){var a=this;clearTimeout(this.timeout),this.hide(function(){a.$element.off("."+a.type).removeData("bs."+a.type)})};var d=a.fn.tooltip;a.fn.tooltip=b,a.fn.tooltip.Constructor=c,a.fn.tooltip.noConflict=function(){return a.fn.tooltip=d,this}}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.popover"),f="object"==typeof b&&b;(e||!/destroy|hide/.test(b))&&(e||d.data("bs.popover",e=new c(this,f)),"string"==typeof b&&e[b]())})}var c=function(a,b){this.init("popover",a,b)};if(!a.fn.tooltip)throw new Error("Popover requires tooltip.js");c.VERSION="3.3.4",c.DEFAULTS=a.extend({},a.fn.tooltip.Constructor.DEFAULTS,{placement:"right",trigger:"click",content:"",template:'<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'}),c.prototype=a.extend({},a.fn.tooltip.Constructor.prototype),c.prototype.constructor=c,c.prototype.getDefaults=function(){return c.DEFAULTS},c.prototype.setContent=function(){var a=this.tip(),b=this.getTitle(),c=this.getContent();a.find(".popover-title")[this.options.html?"html":"text"](b),a.find(".popover-content").children().detach().end()[this.options.html?"string"==typeof c?"html":"append":"text"](c),a.removeClass("fade top bottom left right in"),a.find(".popover-title").html()||a.find(".popover-title").hide()},c.prototype.hasContent=function(){return this.getTitle()||this.getContent()},c.prototype.getContent=function(){var a=this.$element,b=this.options;return a.attr("data-content")||("function"==typeof b.content?b.content.call(a[0]):b.content)},c.prototype.arrow=function(){return this.$arrow=this.$arrow||this.tip().find(".arrow")};var d=a.fn.popover;a.fn.popover=b,a.fn.popover.Constructor=c,a.fn.popover.noConflict=function(){return a.fn.popover=d,this}}(jQuery),+function(a){function b(c,d){this.$body=a(document.body),this.$scrollElement=a(a(c).is(document.body)?window:c),this.options=a.extend({},b.DEFAULTS,d),this.selector=(this.options.target||"")+" .nav li > a",this.offsets=[],this.targets=[],this.activeTarget=null,this.scrollHeight=0,this.$scrollElement.on("scroll.bs.scrollspy",a.proxy(this.process,this)),this.refresh(),this.process()}function c(c){return this.each(function(){var d=a(this),e=d.data("bs.scrollspy"),f="object"==typeof c&&c;e||d.data("bs.scrollspy",e=new b(this,f)),"string"==typeof c&&e[c]()})}b.VERSION="3.3.4",b.DEFAULTS={offset:10},b.prototype.getScrollHeight=function(){return this.$scrollElement[0].scrollHeight||Math.max(this.$body[0].scrollHeight,document.documentElement.scrollHeight)},b.prototype.refresh=function(){var b=this,c="offset",d=0;this.offsets=[],this.targets=[],this.scrollHeight=this.getScrollHeight(),a.isWindow(this.$scrollElement[0])||(c="position",d=this.$scrollElement.scrollTop()),this.$body.find(this.selector).map(function(){var b=a(this),e=b.data("target")||b.attr("href"),f=/^#./.test(e)&&a(e);return f&&f.length&&f.is(":visible")&&[[f[c]().top+d,e]]||null}).sort(function(a,b){return a[0]-b[0]}).each(function(){b.offsets.push(this[0]),b.targets.push(this[1])})},b.prototype.process=function(){var a,b=this.$scrollElement.scrollTop()+this.options.offset,c=this.getScrollHeight(),d=this.options.offset+c-this.$scrollElement.height(),e=this.offsets,f=this.targets,g=this.activeTarget;if(this.scrollHeight!=c&&this.refresh(),b>=d)return g!=(a=f[f.length-1])&&this.activate(a);if(g&&b<e[0])return this.activeTarget=null,this.clear();for(a=e.length;a--;)g!=f[a]&&b>=e[a]&&(void 0===e[a+1]||b<e[a+1])&&this.activate(f[a])},b.prototype.activate=function(b){this.activeTarget=b,this.clear();var c=this.selector+'[data-target="'+b+'"],'+this.selector+'[href="'+b+'"]',d=a(c).parents("li").addClass("active");d.parent(".dropdown-menu").length&&(d=d.closest("li.dropdown").addClass("active")),d.trigger("activate.bs.scrollspy")},b.prototype.clear=function(){a(this.selector).parentsUntil(this.options.target,".active").removeClass("active")};var d=a.fn.scrollspy;a.fn.scrollspy=c,a.fn.scrollspy.Constructor=b,a.fn.scrollspy.noConflict=function(){return a.fn.scrollspy=d,this},a(window).on("load.bs.scrollspy.data-api",function(){a('[data-spy="scroll"]').each(function(){var b=a(this);c.call(b,b.data())})})}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.tab");e||d.data("bs.tab",e=new c(this)),"string"==typeof b&&e[b]()})}var c=function(b){this.element=a(b)};c.VERSION="3.3.4",c.TRANSITION_DURATION=150,c.prototype.show=function(){var b=this.element,c=b.closest("ul:not(.dropdown-menu)"),d=b.data("target");if(d||(d=b.attr("href"),d=d&&d.replace(/.*(?=#[^\s]*$)/,"")),!b.parent("li").hasClass("active")){
  var e=c.find(".active:last a"),f=a.Event("hide.bs.tab",{relatedTarget:b[0]}),g=a.Event("show.bs.tab",{relatedTarget:e[0]});if(e.trigger(f),b.trigger(g),!g.isDefaultPrevented()&&!f.isDefaultPrevented()){var h=a(d);this.activate(b.closest("li"),c),this.activate(h,h.parent(),function(){e.trigger({type:"hidden.bs.tab",relatedTarget:b[0]}),b.trigger({type:"shown.bs.tab",relatedTarget:e[0]})})}}},c.prototype.activate=function(b,d,e){function f(){g.removeClass("active").find("> .dropdown-menu > .active").removeClass("active").end().find('[data-toggle="tab"]').attr("aria-expanded",!1),b.addClass("active").find('[data-toggle="tab"]').attr("aria-expanded",!0),h?(b[0].offsetWidth,b.addClass("in")):b.removeClass("fade"),b.parent(".dropdown-menu").length&&b.closest("li.dropdown").addClass("active").end().find('[data-toggle="tab"]').attr("aria-expanded",!0),e&&e()}var g=d.find("> .active"),h=e&&a.support.transition&&(g.length&&g.hasClass("fade")||!!d.find("> .fade").length);g.length&&h?g.one("bsTransitionEnd",f).emulateTransitionEnd(c.TRANSITION_DURATION):f(),g.removeClass("in")};var d=a.fn.tab;a.fn.tab=b,a.fn.tab.Constructor=c,a.fn.tab.noConflict=function(){return a.fn.tab=d,this};var e=function(c){c.preventDefault(),b.call(a(this),"show")};a(document).on("click.bs.tab.data-api",'[data-toggle="tab"]',e).on("click.bs.tab.data-api",'[data-toggle="pill"]',e)}(jQuery),+function(a){function b(b){return this.each(function(){var d=a(this),e=d.data("bs.affix"),f="object"==typeof b&&b;e||d.data("bs.affix",e=new c(this,f)),"string"==typeof b&&e[b]()})}var c=function(b,d){this.options=a.extend({},c.DEFAULTS,d),this.$target=a(this.options.target).on("scroll.bs.affix.data-api",a.proxy(this.checkPosition,this)).on("click.bs.affix.data-api",a.proxy(this.checkPositionWithEventLoop,this)),this.$element=a(b),this.affixed=null,this.unpin=null,this.pinnedOffset=null,this.checkPosition()};c.VERSION="3.3.4",c.RESET="affix affix-top affix-bottom",c.DEFAULTS={offset:0,target:window},c.prototype.getState=function(a,b,c,d){var e=this.$target.scrollTop(),f=this.$element.offset(),g=this.$target.height();if(null!=c&&"top"==this.affixed)return c>e?"top":!1;if("bottom"==this.affixed)return null!=c?e+this.unpin<=f.top?!1:"bottom":a-d>=e+g?!1:"bottom";var h=null==this.affixed,i=h?e:f.top,j=h?g:b;return null!=c&&c>=e?"top":null!=d&&i+j>=a-d?"bottom":!1},c.prototype.getPinnedOffset=function(){if(this.pinnedOffset)return this.pinnedOffset;this.$element.removeClass(c.RESET).addClass("affix");var a=this.$target.scrollTop(),b=this.$element.offset();return this.pinnedOffset=b.top-a},c.prototype.checkPositionWithEventLoop=function(){setTimeout(a.proxy(this.checkPosition,this),1)},c.prototype.checkPosition=function(){if(this.$element.is(":visible")){var b=this.$element.height(),d=this.options.offset,e=d.top,f=d.bottom,g=a(document.body).height();"object"!=typeof d&&(f=e=d),"function"==typeof e&&(e=d.top(this.$element)),"function"==typeof f&&(f=d.bottom(this.$element));var h=this.getState(g,b,e,f);if(this.affixed!=h){null!=this.unpin&&this.$element.css("top","");var i="affix"+(h?"-"+h:""),j=a.Event(i+".bs.affix");if(this.$element.trigger(j),j.isDefaultPrevented())return;this.affixed=h,this.unpin="bottom"==h?this.getPinnedOffset():null,this.$element.removeClass(c.RESET).addClass(i).trigger(i.replace("affix","affixed")+".bs.affix")}"bottom"==h&&this.$element.offset({top:g-b-f})}};var d=a.fn.affix;a.fn.affix=b,a.fn.affix.Constructor=c,a.fn.affix.noConflict=function(){return a.fn.affix=d,this},a(window).on("load",function(){a('[data-spy="affix"]').each(function(){var c=a(this),d=c.data();d.offset=d.offset||{},null!=d.offsetBottom&&(d.offset.bottom=d.offsetBottom),null!=d.offsetTop&&(d.offset.top=d.offsetTop),b.call(c,d)})})}(jQuery);
define("bootstrap", ["jquery"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.$.fn.popover;
    };
}(this)));

if(typeof jwplayer=="undefined"){jwplayer=function(a){if(jwplayer.api){return jwplayer.api.selectPlayer(a)}};jwplayer.version="6.11.0";jwplayer.vid=document.createElement("video");jwplayer.audio=document.createElement("audio");jwplayer.source=document.createElement("source");(function(){var l=this;var a={};var f=Array.prototype,r=Object.prototype,t=Function.prototype;var k=f.slice,d=f.concat,n=r.toString,i=r.hasOwnProperty;var e=f.map,h=f.forEach,g=f.filter,p=f.some,m=f.indexOf,b=Array.isArray,q=Object.keys;var s=function(u){if(u instanceof s){return u}if(!(this instanceof s)){return new s(u)}};var c=s.each=s.forEach=function(z,w,v){if(z==null){return z}if(h&&z.forEach===h){z.forEach(w,v)}else{if(z.length===+z.length){for(var u=0,y=z.length;u<y;u++){if(w.call(v,z[u],u,z)===a){return}}}else{var x=s.keys(z);for(var u=0,y=x.length;u<y;u++){if(w.call(v,z[x[u]],x[u],z)===a){return}}}}return z};s.map=s.collect=function(x,w,v){var u=[];if(x==null){return u}if(e&&x.map===e){return x.map(w,v)}c(x,function(A,y,z){u.push(w.call(v,A,y,z))});return u};s.find=s.detect=function(x,v,w){var u;j(x,function(A,y,z){if(v.call(w,A,y,z)){u=A;return true}});return u};s.filter=s.select=function(x,u,w){var v=[];if(x==null){return v}if(g&&x.filter===g){return x.filter(u,w)}c(x,function(A,y,z){if(u.call(w,A,y,z)){v.push(A)}});return v};var j=s.some=s.any=function(x,v,w){v||(v=s.identity);var u=false;if(x==null){return u}if(p&&x.some===p){return x.some(v,w)}c(x,function(A,y,z){if(u||(u=v.call(w,A,y,z))){return a}});return !!u};var o=function(u){if(u==null){return s.identity}if(s.isFunction(u)){return u}return s.property(u)};s.sortedIndex=function(B,A,x,w){x=o(x);var z=x.call(w,A);var u=0,y=B.length;while(u<y){var v=(u+y)>>>1;x.call(w,B[v])<z?u=v+1:y=v}return u};s.find=s.detect=function(x,v,w){var u;j(x,function(A,y,z){if(v.call(w,A,y,z)){u=A;return true}});return u};var j=s.some=s.any=function(x,v,w){v||(v=s.identity);var u=false;if(x==null){return u}if(p&&x.some===p){return x.some(v,w)}c(x,function(A,y,z){if(u||(u=v.call(w,A,y,z))){return a}});return !!u};s.contains=s.include=function(v,u){if(v==null){return false}if(v.length!==+v.length){v=s.values(v)}return s.indexOf(v,u)>=0};s.difference=function(v){var u=d.apply(f,k.call(arguments,1));return s.filter(v,function(w){return !s.contains(u,w)})};s.indexOf=function(y,w,x){if(y==null){return -1}var u=0,v=y.length;if(x){if(typeof x=="number"){u=(x<0?Math.max(0,v+x):x)}else{u=s.sortedIndex(y,w);return y[u]===w?u:-1}}if(m&&y.indexOf===m){return y.indexOf(w,x)}for(;u<v;u++){if(y[u]===w){return u}}return -1};s.memoize=function(w,v){var u={};v||(v=s.identity);return function(){var x=v.apply(this,arguments);return s.has(u,x)?u[x]:(u[x]=w.apply(this,arguments))}};s.keys=function(w){if(!s.isObject(w)){return[]}if(q){return q(w)}var v=[];for(var u in w){if(s.has(w,u)){v.push(u)}}return v};s.pick=function(v){var w={};var u=d.apply(f,k.call(arguments,1));c(u,function(x){if(x in v){w[x]=v[x]}});return w};s.isArray=b||function(u){return n.call(u)=="[object Array]"};s.isObject=function(u){return u===Object(u)};c(["Arguments","Function","String","Number","Date","RegExp"],function(u){s["is"+u]=function(v){return n.call(v)=="[object "+u+"]"}});if(!s.isArguments(arguments)){s.isArguments=function(u){return !!(u&&s.has(u,"callee"))}}if(typeof(/./)!=="function"){s.isFunction=function(u){return typeof u==="function"}}s.isFinite=function(u){return isFinite(u)&&!isNaN(parseFloat(u))};s.isNaN=function(u){return s.isNumber(u)&&u!=+u};s.isBoolean=function(u){return u===true||u===false||n.call(u)=="[object Boolean]"};s.isNull=function(u){return u===null};s.isUndefined=function(u){return u===void 0};s.has=function(v,u){return i.call(v,u)};s.identity=function(u){return u};s.constant=function(u){return function(){return u}};s.property=function(u){return function(v){return v[u]}};l._=s}).call(jwplayer);(function(c){var h=c.utils={};var i=c._;h.exists=function(m){switch(typeof(m)){case"string":return(m.length>0);case"object":return(m!==null);case"undefined":return false}return true};h.styleDimension=function(m){return m+(m.toString().indexOf("%")>0?"":"px")};h.getAbsolutePath=function(s,r){if(!h.exists(r)){r=document.location.href}if(!h.exists(s)){return}if(a(s)){return s}var t=r.substring(0,r.indexOf("://")+3);var q=r.substring(t.length,r.indexOf("/",t.length+1));var n;if(s.indexOf("/")===0){n=s.split("/")}else{var o=r.split("?")[0];o=o.substring(t.length+q.length+1,o.lastIndexOf("/"));n=o.split("/").concat(s.split("/"))}var m=[];for(var p=0;p<n.length;p++){if(!n[p]||!h.exists(n[p])||n[p]==="."){continue}else{if(n[p]===".."){m.pop()}else{m.push(n[p])}}}return t+q+"/"+m.join("/")};function a(n){if(!h.exists(n)){return}var o=n.indexOf("://");var m=n.indexOf("?");return(o>0&&(m<0||(m>o)))}h.extend=function(){var n=Array.prototype.slice.call(arguments,0);if(n.length>1){var p=n[0],m=function(r,q){if(q!==undefined&&q!==null){p[r]=q}};for(var o=1;o<n.length;o++){h.foreach(n[o],m)}return p}return null};var d=window.console=window.console||{log:function(){}};h.log=function(){var m=Array.prototype.slice.call(arguments,0);if(typeof d.log==="object"){d.log(m)}else{d.log.apply(d,m)}};var e=i.memoize(function(n){var m=navigator.userAgent.toLowerCase();return(m.match(n)!==null)});function l(m){return function(){return e(m)}}h.isFF=l(/firefox/i);h.isChrome=l(/chrome/i);h.isIPod=l(/iP(hone|od)/i);h.isIPad=l(/iPad/i);h.isSafari602=l(/Macintosh.*Mac OS X 10_8.*6\.0\.\d* Safari/i);h.isIETrident=function(m){if(m){m=parseFloat(m).toFixed(1);return e(new RegExp("trident/.+rv:\\s*"+m,"i"))}return e(/trident/i)};h.isMSIE=function(m){if(m){m=parseFloat(m).toFixed(1);return e(new RegExp("msie\\s*"+m,"i"))}return e(/msie/i)};h.isIE=function(m){if(m){m=parseFloat(m).toFixed(1);if(m>=11){return h.isIETrident(m)}else{return h.isMSIE(m)}}return h.isMSIE()||h.isIETrident()};h.isSafari=function(){return(e(/safari/i)&&!e(/chrome/i)&&!e(/chromium/i)&&!e(/android/i))};h.isIOS=function(m){if(m){return e(new RegExp("iP(hone|ad|od).+\\sOS\\s"+m,"i"))}return e(/iP(hone|ad|od)/i)};h.isAndroidNative=function(m){return h.isAndroid(m,true)};h.isAndroid=function(m,n){if(n&&e(/chrome\/[123456789]/i)&&!e(/chrome\/18/)){return false}if(m){if(h.isInt(m)&&!/\./.test(m)){m=""+m+"."}return e(new RegExp("Android\\s*"+m,"i"))}return e(/Android/i)};h.isMobile=function(){return h.isIOS()||h.isAndroid()};h.saveCookie=function(m,n){document.cookie="jwplayer."+m+"="+n+"; path=/"};h.getCookies=function(){var p={};var o=document.cookie.split("; ");for(var n=0;n<o.length;n++){var m=o[n].split("=");if(m[0].indexOf("jwplayer.")===0){p[m[0].substring(9,m[0].length)]=m[1]}}return p};h.isInt=function(m){return parseFloat(m)%1===0};h.typeOf=function(n){if(n===null){return"null"}var m=typeof n;if(m==="object"){if(i.isArray(n)){return"array"}}return m};h.translateEventResponse=function(o,m){var q=h.extend({},m);if(o===c.events.JWPLAYER_FULLSCREEN&&!q.fullscreen){q.fullscreen=(q.message==="true");delete q.message}else{if(typeof q.data==="object"){var p=q.data;delete q.data;q=h.extend(q,p)}else{if(typeof q.metadata==="object"){h.deepReplaceKeyName(q.metadata,["__dot__","__spc__","__dsh__","__default__"],["."," ","-","default"])}}}var n=["position","duration","offset"];h.foreach(n,function(r,s){if(q[s]){q[s]=Math.round(q[s]*1000)/1000}});return q};h.flashVersion=function(){if(h.isAndroid()){return 0}var m=navigator.plugins,n;try{if(m!=="undefined"){n=m["Shockwave Flash"];if(n){return parseInt(n.description.replace(/\D+(\d+)\..*/,"$1"),10)}}}catch(p){}if(typeof window.ActiveXObject!=="undefined"){try{n=new window.ActiveXObject("ShockwaveFlash.ShockwaveFlash");if(n){return parseInt(n.GetVariable("$version").split(" ")[1].split(",")[0],10)}}catch(o){}}return 0};h.getScriptPath=function(o){var m=document.getElementsByTagName("script");for(var n=0;n<m.length;n++){var p=m[n].src;if(p&&p.indexOf(o)>=0){return p.substr(0,p.indexOf(o))}}return""};h.deepReplaceKeyName=function(p,n,m){switch(c.utils.typeOf(p)){case"array":for(var o=0;o<p.length;o++){p[o]=c.utils.deepReplaceKeyName(p[o],n,m)}break;case"object":h.foreach(p,function(s,u){var t;if(n instanceof Array&&m instanceof Array){if(n.length!==m.length){return}else{t=n}}else{t=[n]}var q=s;for(var r=0;r<t.length;r++){q=q.replace(new RegExp(n[r],"g"),m[r])}p[q]=c.utils.deepReplaceKeyName(u,n,m);if(s!==q){delete p[s]}});break}return p};var f=h.pluginPathType={ABSOLUTE:0,RELATIVE:1,CDN:2};h.getPluginPathType=function(n){if(typeof n!=="string"){return}n=n.split("?")[0];var o=n.indexOf("://");if(o>0){return f.ABSOLUTE}var m=n.indexOf("/");var p=h.extension(n);if(o<0&&m<0&&(!p||!isNaN(p))){return f.CDN}return f.RELATIVE};h.getPluginName=function(m){return m.replace(/^(.*\/)?([^-]*)-?.*\.(swf|js)$/,"$2")};h.getPluginVersion=function(m){return m.replace(/[^-]*-?([^\.]*).*$/,"$1")};h.isYouTube=function(m){return(/^(http|\/\/).*(youtube\.com|youtu\.be)\/.+/).test(m)};h.youTubeID=function(n){try{return(/v[=\/]([^?&]*)|youtu\.be\/([^?]*)|^([\w-]*)$/i).exec(n).slice(1).join("").replace("?","")}catch(m){return""}};h.isRtmp=function(m,n){return(m.indexOf("rtmp")===0||n==="rtmp")};h.foreach=function(n,m){var o,p;for(o in n){if(h.typeOf(n.hasOwnProperty)==="function"){if(n.hasOwnProperty(o)){p=n[o];m(o,p)}}else{p=n[o];m(o,p)}}};h.isHTTPS=function(){return(window.location.href.indexOf("https")===0)};h.repo=function(){var m="http://p.jwpcdn.com/"+c.version.split(/\W/).splice(0,2).join("/")+"/";try{if(h.isHTTPS()){m=m.replace("http://","https://ssl.")}}catch(n){}return m};h.versionCheck=function(o){var q=("0"+o).split(/\W/);var p=c.version.split(/\W/);var n=parseFloat(q[0]);var m=parseFloat(p[0]);if(n>m){return false}else{if(n===m){if(parseFloat("0"+q[1])>parseFloat(p[1])){return false}}}return true};h.ajax=function(s,q,m,r){var o;var p=false;if(s.indexOf("#")>0){s=s.replace(/#.*$/,"")}if(b(s)&&h.exists(window.XDomainRequest)){o=new window.XDomainRequest();o.onload=k(o,s,q,m,r);o.ontimeout=o.onprogress=function(){};o.timeout=5000}else{if(h.exists(window.XMLHttpRequest)){o=new window.XMLHttpRequest();o.onreadystatechange=g(o,s,q,m,r)}else{if(m){m("",s,o)}return o}}if(o.overrideMimeType){o.overrideMimeType("text/xml")}o.onerror=j(m,s,o);try{o.open("GET",s,true)}catch(n){p=true}setTimeout(function(){if(p){if(m){m(s,s,o)}return}try{o.send()}catch(t){if(m){m(s,s,o)}}},0);return o};function b(m){return(m&&m.indexOf("://")>=0)&&(m.split("/")[2]!==window.location.href.split("/")[2])}function j(m,o,n){return function(){m("Error loading file",o,n)}}function g(n,q,o,m,p){return function(){if(n.readyState===4){switch(n.status){case 200:k(n,q,o,m,p)();break;case 404:m("File not found",q,n)}}}}function k(n,q,o,m,p){return function(){var r,u;if(p){o(n)}else{try{r=n.responseXML;if(r){u=r.firstChild;if(r.lastChild&&r.lastChild.nodeName==="parsererror"){if(m){m("Invalid XML",q,n)}return}}}catch(t){}if(r&&u){return o(n)}var s=h.parseXML(n.responseText);if(s&&s.firstChild){n=h.extend({},n,{responseXML:s})}else{if(m){m(n.responseText?"Invalid XML":q,q,n)}return}o(n)}}}h.parseXML=function(m){var n;try{if(window.DOMParser){n=(new window.DOMParser()).parseFromString(m,"text/xml");if(n.childNodes&&n.childNodes.length&&n.childNodes[0].firstChild.nodeName==="parsererror"){return}}else{n=new window.ActiveXObject("Microsoft.XMLDOM");n.async="false";n.loadXML(m)}}catch(o){return}return n};h.between=function(n,o,m){return Math.max(Math.min(n,m),o)};h.seconds=function(o){if(i.isNumber(o)){return o}o=o.replace(",",".");var m=o.split(":");var n=0;if(o.slice(-1)==="s"){n=parseFloat(o)}else{if(o.slice(-1)==="m"){n=parseFloat(o)*60}else{if(o.slice(-1)==="h"){n=parseFloat(o)*3600}else{if(m.length>1){n=parseFloat(m[m.length-1]);n+=parseFloat(m[m.length-2])*60;if(m.length===3){n+=parseFloat(m[m.length-3])*3600}}else{n=parseFloat(o)}}}}return n};h.serialize=function(m){if(m===null){return null}else{if(m.toString().toLowerCase()==="true"){return true}else{if(m.toString().toLowerCase()==="false"){return false}else{if(isNaN(Number(m))||m.length>5||m.length===0){return m}else{return Number(m)}}}}};h.addClass=function(o,n){var m=i.isString(o.className)?o.className.split(" "):[];var p=i.isArray(n)?n:n.split(" ");i.each(p,function(q){if(!i.contains(m,q)){m.push(q)}});o.className=h.trim(m.join(" "))};h.removeClass=function(o,p){var n=i.isString(o.className)?o.className.split(" "):[];var m=i.isArray(p)?p:p.split(" ");o.className=h.trim(i.difference(n,m).join(" "))};h.indexOf=i.indexOf;h.noop=function(){};h.canCast=function(){var m=c.cast;return !!(m&&i.isFunction(m.available)&&m.available())}})(jwplayer);(function(j){var p=j.utils,g=50000,b={},s,a={},i=null,o={},c=false;function q(u){var v=document.createElement("style");if(u){v.appendChild(document.createTextNode(u))}v.type="text/css";document.getElementsByTagName("head")[0].appendChild(v);return v}p.cssKeyframes=function(x,y){var v=b.keyframes;if(!v){v=q();b.keyframes=v}var w=v.sheet;var u="@keyframes "+x+" { "+y+" }";n(w,u,w.cssRules.length);n(w,u.replace(/(keyframes|transform)/g,"-webkit-$1"),w.cssRules.length)};var k=p.css=function(v,x,w){w=w||false;if(!a[v]){a[v]={}}if(!d(a[v],x,w)){return}if(c){if(b[v]){b[v].parentNode.removeChild(b[v])}b[v]=q(r(v));return}if(!b[v]){var u=s&&s.sheet&&s.sheet.cssRules&&s.sheet.cssRules.length||0;if(!s||u>g){s=q()}b[v]=s}if(i!==null){i.styleSheets[v]=a[v];return}f(v)};k.style=function(x,w,u){if(x===undefined||x===null){return}if(x.length===undefined){x=[x]}var v={};t(v,w);if(i!==null&&!u){x.__cssRules=e(x.__cssRules,v);if(i.elements.indexOf(x)<0){i.elements.push(x)}return}m(x,v)};k.block=function(u){if(i===null){i={id:u,styleSheets:{},elements:[]}}};k.unblock=function(x){if(i&&(!x||i.id===x)){for(var u in i.styleSheets){f(u)}for(var v=0;v<i.elements.length;v++){var w=i.elements[v];m(w,w.__cssRules)}i=null}};function e(v,u){v=v||{};for(var w in u){v[w]=u[w]}return v}function d(v,y,u){var x=false,w,z;for(w in y){z=h(w,y[w],u);if(z!==""){if(z!==v[w]){v[w]=z;x=true}}else{if(v[w]!==undefined){delete v[w];x=true}}}return x}function t(u,w){for(var v in w){u[v]=h(v,w[v])}}function l(u){u=u.split("-");for(var v=1;v<u.length;v++){u[v]=u[v].charAt(0).toUpperCase()+u[v].slice(1)}return u.join("")}function h(w,x,u){if(!p.exists(x)){return""}var v=u?" !important":"";if(typeof x==="string"&&isNaN(x)){if((/png|gif|jpe?g/i).test(x)&&x.indexOf("url")<0){return"url("+x+")"}return x+v}if(x===0||w==="z-index"||w==="opacity"){return""+x+v}if((/color/i).test(w)){return"#"+p.pad(x.toString(16).replace(/^0x/i,""),6)+v}return Math.ceil(x)+"px"+v}function m(z,u){for(var x=0;x<z.length;x++){var w=z[x],y,v;if(w!==undefined&&w!==null){for(y in u){v=l(y);if(w.style[v]!==u[y]){w.style[v]=u[y]}}}}}function f(u){var x=b[u].sheet,w,y,v;if(x){w=x.cssRules;y=o[u];v=r(u);if(y!==undefined&&y<w.length&&w[y].selectorText===u){if(v===w[y].cssText){return}x.deleteRule(y)}else{y=w.length;o[u]=y}n(x,v,y)}}function n(v,x,u){try{v.insertRule(x,u)}catch(w){}}function r(u){var w=a[u];u+=" { ";for(var v in w){u+=v+": "+w[v]+"; "}return u+"}"}p.clearCss=function(v){for(var w in a){if(w.indexOf(v)>=0){delete a[w]}}for(var u in b){if(u.indexOf(v)>=0){f(u)}}};p.transform=function(v,x){var u="transform",w={};x=x||"";w[u]=x;w["-webkit-"+u]=x;w["-ms-"+u]=x;w["-moz-"+u]=x;w["-o-"+u]=x;if(typeof v==="string"){k(v,w)}else{k.style(v,w)}};p.dragStyle=function(u,v){k(u,{"-webkit-user-select":v,"-moz-user-select":v,"-ms-user-select":v,"-webkit-user-drag":v,"user-select":v,"user-drag":v})};p.transitionStyle=function(u,v){if(navigator.userAgent.match(/5\.\d(\.\d)? safari/i)){return}k(u,{"-webkit-transition":v,"-moz-transition":v,"-o-transition":v,transition:v})};p.rotate=function(u,v){p.transform(u,"rotate("+v+"deg)")};p.rgbHex=function(u){var v=String(u).replace("#","");if(v.length===3){v=v[0]+v[0]+v[1]+v[1]+v[2]+v[2]}return"#"+v.substr(-6)};p.hexToRgba=function(w,v){var x="rgb";var u=[parseInt(w.substr(1,2),16),parseInt(w.substr(3,2),16),parseInt(w.substr(5,2),16)];if(v!==undefined&&v!==100){x+="a";u.push(v/100)}return x+"("+u.join(",")+")"}})(jwplayer);(function(o){var e="video/",h="audio/",j="mp4",c="webm",n="ogg",b="aac",k="mp3",l="vorbis",d=o.foreach,m={mp4:e+j,ogg:e+n,oga:h+n,vorbis:h+n,webm:e+c,aac:h+j,mp3:h+"mpeg",hls:"application/vnd.apple.mpegurl"},g={mp4:m[j],f4v:m[j],m4v:m[j],mov:m[j],m4a:m[b],f4a:m[b],aac:m[b],mp3:m[k],ogv:m[n],ogg:m[n],oga:m[l],vorbis:m[l],webm:m[c],m3u8:m.hls,m3u:m.hls,hls:m.hls},i="video",f={flv:i,f4v:i,mov:i,m4a:i,m4v:i,mp4:i,aac:i,f4a:i,mp3:"sound",smil:"rtmp",m3u8:"hls",hls:"hls"};var a=o.extensionmap={};d(g,function(p,q){a[p]={html5:q}});d(f,function(p,q){if(!a[p]){a[p]={}}a[p].flash=q});a.types=m;a.mimeType=function(q){var p;d(m,function(r,s){if(!p&&s==q){p=r}});return p};a.extType=function(p){return a.mimeType(g[p])}})(jwplayer.utils);(function(b){var a=b.loaderstatus={NEW:0,LOADING:1,ERROR:2,COMPLETE:3},c=document;b.scriptloader=function(d){var g=jwplayer.events,i=b.extend(this,new g.eventdispatcher()),e=a.NEW;this.load=function(){if(e==a.NEW){var k=b.scriptloader.loaders[d];if(k){e=k.getStatus();if(e<2){k.addEventListener(g.ERROR,f);k.addEventListener(g.COMPLETE,h);return}}var j=c.createElement("script");if(j.addEventListener){j.onload=h;j.onerror=f}else{if(j.readyState){j.onreadystatechange=function(l){if(j.readyState=="loaded"||j.readyState=="complete"){h(l)}}}}c.getElementsByTagName("head")[0].appendChild(j);j.src=d;e=a.LOADING;b.scriptloader.loaders[d]=this}};function f(j){e=a.ERROR;i.sendEvent(g.ERROR,j)}function h(j){e=a.COMPLETE;i.sendEvent(g.COMPLETE,j)}this.getStatus=function(){return e}};b.scriptloader.loaders={}})(jwplayer.utils);(function(a){a.trim=function(c){return c.replace(/^\s+|\s+$/g,"")};a.pad=function(e,d,c){if(!c){c="0"}while(e.length<d){e=c+e}return e};a.xmlAttribute=function(c,d){for(var e=0;e<c.attributes.length;e++){if(c.attributes[e].name&&c.attributes[e].name.toLowerCase()===d.toLowerCase()){return c.attributes[e].value.toString()}}return""};function b(c){if(c.indexOf("(format=m3u8-")>-1){return"m3u8"}else{return false}}a.extension=function(d){if(!d||d.substr(0,4)==="rtmp"){return""}var c=b(d);if(c){return c}d=d.substring(d.lastIndexOf("/")+1,d.length).split("?")[0].split("#")[0];if(d.lastIndexOf(".")>-1){return d.substr(d.lastIndexOf(".")+1,d.length).toLowerCase()}};a.stringToColor=function(c){c=c.replace(/(#|0x)?([0-9A-F]{3,6})$/gi,"$2");if(c.length===3){c=c.charAt(0)+c.charAt(0)+c.charAt(1)+c.charAt(1)+c.charAt(2)+c.charAt(2)}return parseInt(c,16)}})(jwplayer.utils);(function(b){var c="touchmove",d="touchstart",a="touchend",e="touchcancel";b.touch=function(f){var q=f,k=false,g={},i=null,l=false,j=b.touchEvents;document.addEventListener(c,h);document.addEventListener(a,n);document.addEventListener(e,h);f.addEventListener(d,h);f.addEventListener(a,h);function n(r){if(k){if(l){o(j.DRAG_END,r)}}l=false;k=false;i=null}function h(r){if(r.type===d){k=true;i=p(j.DRAG_START,r)}else{if(r.type===c){if(k){if(l){o(j.DRAG,r)}else{o(j.DRAG_START,r,i);l=true;o(j.DRAG,r)}}}else{if(k){if(l){o(j.DRAG_END,r)}else{r.cancelBubble=true;o(j.TAP,r)}}l=false;k=false;i=null}}}function o(s,t,u){if(g[s]){m(t);var r=u?u:p(s,t);if(r){g[s](r)}}}function p(s,u){var v=null;if(u.touches&&u.touches.length){v=u.touches[0]}else{if(u.changedTouches&&u.changedTouches.length){v=u.changedTouches[0]}}if(!v){return null}var t=q.getBoundingClientRect();var r={type:s,target:q,x:((v.pageX-window.pageXOffset)-t.left),y:v.pageY,deltaX:0,deltaY:0};if(s!==j.TAP&&i){r.deltaX=r.x-i.x;r.deltaY=r.y-i.y}return r}function m(r){if(r.preventManipulation){r.preventManipulation()}if(r.preventDefault){r.preventDefault()}}this.addEventListener=function(s,r){g[s]=r};this.removeEventListener=function(r){delete g[r]};return this}})(jwplayer.utils);(function(a){a.touchEvents={DRAG:"jwplayerDrag",DRAG_START:"jwplayerDragStart",DRAG_END:"jwplayerDragEnd",TAP:"jwplayerTap"}})(jwplayer.utils);(function(a){a.events={COMPLETE:"COMPLETE",ERROR:"ERROR",API_READY:"jwplayerAPIReady",JWPLAYER_READY:"jwplayerReady",JWPLAYER_FULLSCREEN:"jwplayerFullscreen",JWPLAYER_RESIZE:"jwplayerResize",JWPLAYER_ERROR:"jwplayerError",JWPLAYER_SETUP_ERROR:"jwplayerSetupError",JWPLAYER_MEDIA_BEFOREPLAY:"jwplayerMediaBeforePlay",JWPLAYER_MEDIA_BEFORECOMPLETE:"jwplayerMediaBeforeComplete",JWPLAYER_COMPONENT_SHOW:"jwplayerComponentShow",JWPLAYER_COMPONENT_HIDE:"jwplayerComponentHide",JWPLAYER_MEDIA_BUFFER:"jwplayerMediaBuffer",JWPLAYER_MEDIA_BUFFER_FULL:"jwplayerMediaBufferFull",JWPLAYER_MEDIA_ERROR:"jwplayerMediaError",JWPLAYER_MEDIA_LOADED:"jwplayerMediaLoaded",JWPLAYER_MEDIA_COMPLETE:"jwplayerMediaComplete",JWPLAYER_MEDIA_SEEK:"jwplayerMediaSeek",JWPLAYER_MEDIA_TIME:"jwplayerMediaTime",JWPLAYER_MEDIA_VOLUME:"jwplayerMediaVolume",JWPLAYER_MEDIA_META:"jwplayerMediaMeta",JWPLAYER_MEDIA_MUTE:"jwplayerMediaMute",JWPLAYER_AUDIO_TRACKS:"jwplayerAudioTracks",JWPLAYER_AUDIO_TRACK_CHANGED:"jwplayerAudioTrackChanged",JWPLAYER_MEDIA_LEVELS:"jwplayerMediaLevels",JWPLAYER_MEDIA_LEVEL_CHANGED:"jwplayerMediaLevelChanged",JWPLAYER_CAPTIONS_CHANGED:"jwplayerCaptionsChanged",JWPLAYER_CAPTIONS_LIST:"jwplayerCaptionsList",JWPLAYER_CAPTIONS_LOADED:"jwplayerCaptionsLoaded",JWPLAYER_PLAYER_STATE:"jwplayerPlayerState",state:{BUFFERING:"BUFFERING",IDLE:"IDLE",PAUSED:"PAUSED",PLAYING:"PLAYING"},JWPLAYER_PLAYLIST_LOADED:"jwplayerPlaylistLoaded",JWPLAYER_PLAYLIST_ITEM:"jwplayerPlaylistItem",JWPLAYER_PLAYLIST_COMPLETE:"jwplayerPlaylistComplete",JWPLAYER_DISPLAY_CLICK:"jwplayerViewClick",JWPLAYER_PROVIDER_CLICK:"jwplayerProviderClick",JWPLAYER_VIEW_TAB_FOCUS:"jwplayerViewTabFocus",JWPLAYER_CONTROLS:"jwplayerViewControls",JWPLAYER_USER_ACTION:"jwplayerUserAction",JWPLAYER_INSTREAM_CLICK:"jwplayerInstreamClicked",JWPLAYER_INSTREAM_DESTROYED:"jwplayerInstreamDestroyed",JWPLAYER_AD_TIME:"jwplayerAdTime",JWPLAYER_AD_ERROR:"jwplayerAdError",JWPLAYER_AD_CLICK:"jwplayerAdClicked",JWPLAYER_AD_COMPLETE:"jwplayerAdComplete",JWPLAYER_AD_IMPRESSION:"jwplayerAdImpression",JWPLAYER_AD_COMPANIONS:"jwplayerAdCompanions",JWPLAYER_AD_SKIPPED:"jwplayerAdSkipped",JWPLAYER_AD_PLAY:"jwplayerAdPlay",JWPLAYER_AD_PAUSE:"jwplayerAdPause",JWPLAYER_AD_META:"jwplayerAdMeta",JWPLAYER_CAST_AVAILABLE:"jwplayerCastAvailable",JWPLAYER_CAST_SESSION:"jwplayerCastSession",JWPLAYER_CAST_AD_CHANGED:"jwplayerCastAdChanged"}})(jwplayer);(function(a){var b=a.events,c=a.utils;b.eventdispatcher=function(j,d){var f=j,h=d,g,e;this.resetEventListeners=function(){g={};e=[]};this.resetEventListeners();this.addEventListener=function(k,n,m){try{if(!c.exists(g[k])){g[k]=[]}if(c.typeOf(n)==="string"){n=(new Function("return "+n))()}g[k].push({listener:n,count:m||null})}catch(l){c.log("error",l)}return false};this.removeEventListener=function(l,n){var k;if(!g[l]){return}try{if(n===undefined){g[l]=[];return}for(k=0;k<g[l].length;k++){if(g[l][k].listener.toString()===n.toString()){g[l].splice(k,1);break}}}catch(m){c.log("error",m)}return false};this.addGlobalListener=function(m,l){try{if(c.typeOf(m)==="string"){m=(new Function("return "+m))()}e.push({listener:m,count:l||null})}catch(k){c.log("error",k)}return false};this.removeGlobalListener=function(m){if(!m){return}try{for(var k=e.length;k--;){if(e[k].listener.toString()===m.toString()){e.splice(k,1)}}}catch(l){c.log("error",l)}return false};this.sendEvent=function(k,l){if(!c.exists(l)){l={}}c.extend(l,{id:f,version:a.version,type:k});if(h){c.log(k,l)}i(g[k],l,k);i(e,l,k)};function i(m,p,l){if(!m){return}for(var k=0;k<m.length;k++){var o=m[k];if(o){if(o.count!==null&&--o.count===0){delete m[k]}try{o.listener(p)}catch(n){c.log('Error handling "'+l+'" event listener ['+k+"]: "+n.toString(),o.listener,p)}}}}}})(window.jwplayer);(function(a){var c={},b={};a.plugins=function(){};a.plugins.loadPlugins=function(e,d){b[e]=new a.plugins.pluginloader(new a.plugins.model(c),d);return b[e]};a.plugins.registerPlugin=function(h,g,f,e){var d=a.utils.getPluginName(h);if(!c[d]){c[d]=new a.plugins.plugin(h)}c[d].registerPlugin(h,g,f,e)}})(jwplayer);(function(a){a.plugins.model=function(b){this.addPlugin=function(c){var d=a.utils.getPluginName(c);if(!b[d]){b[d]=new a.plugins.plugin(c)}return b[d]};this.getPlugins=function(){return b}}})(jwplayer);(function(b){var a=jwplayer.utils,c=jwplayer.events,d="undefined";b.pluginmodes={FLASH:0,JAVASCRIPT:1,HYBRID:2};b.plugin=function(e){var l=a.loaderstatus.NEW,m,k,f,n;var g=new c.eventdispatcher();a.extend(this,g);function h(){switch(a.getPluginPathType(e)){case a.pluginPathType.ABSOLUTE:return e;case a.pluginPathType.RELATIVE:return a.getAbsolutePath(e,window.location.href)}}function j(){n=setTimeout(function(){l=a.loaderstatus.COMPLETE;g.sendEvent(c.COMPLETE)},1000)}function i(){l=a.loaderstatus.ERROR;g.sendEvent(c.ERROR,{url:e})}this.load=function(){if(l===a.loaderstatus.NEW){if(e.lastIndexOf(".swf")>0){m=e;l=a.loaderstatus.COMPLETE;g.sendEvent(c.COMPLETE);return}else{if(a.getPluginPathType(e)===a.pluginPathType.CDN){l=a.loaderstatus.COMPLETE;g.sendEvent(c.COMPLETE);return}}l=a.loaderstatus.LOADING;var o=new a.scriptloader(h());o.addEventListener(c.COMPLETE,j);o.addEventListener(c.ERROR,i);o.load()}};this.registerPlugin=function(r,q,p,o){if(n){clearTimeout(n);n=undefined}f=q;if(p&&o){m=o;k=p}else{if(typeof p==="string"){m=p}else{if(typeof p==="function"){k=p}else{if(!p&&!o){m=r}}}}l=a.loaderstatus.COMPLETE;g.sendEvent(c.COMPLETE)};this.getStatus=function(){return l};this.getPluginName=function(){return a.getPluginName(e)};this.getFlashPath=function(){if(m){switch(a.getPluginPathType(m)){case a.pluginPathType.ABSOLUTE:return m;case a.pluginPathType.RELATIVE:if(e.lastIndexOf(".swf")>0){return a.getAbsolutePath(m,window.location.href)}return a.getAbsolutePath(m,h())}}return null};this.getJS=function(){return k};this.getTarget=function(){return f};this.getPluginmode=function(){if(typeof m!==d&&typeof k!==d){return b.pluginmodes.HYBRID}else{if(typeof m!==d){return b.pluginmodes.FLASH}else{if(typeof k!==d){return b.pluginmodes.JAVASCRIPT}}}};this.getNewInstance=function(p,o,q){return new k(p,o,q)};this.getURL=function(){return e}}})(jwplayer.plugins);(function(b){var a=b.utils,c=b.events,d=a.foreach;b.plugins.pluginloader=function(j,h){var n=a.loaderstatus.NEW,g=false,e=false,l=h,f=new c.eventdispatcher();a.extend(this,f);function i(o){if(o){f.sendEvent(c.ERROR,{message:o.message});if(o.url){a.log(o.message,o.url)}}if(!e){e=true;n=a.loaderstatus.COMPLETE;f.sendEvent(c.COMPLETE)}}function m(){if(!l){i()}if(!e){var p=0,o=j.getPlugins();a.foreach(l,function(r){var s=a.getPluginName(r),v=o[s],u=v.getJS(),t=v.getTarget(),q=v.getStatus();if(q==a.loaderstatus.LOADING||q==a.loaderstatus.NEW){p++}else{if(u&&!a.versionCheck(t)){i({message:"Incompatible player version"})}}});if(p===0){i()}}}function k(o){i({message:"File not found",url:o.url})}this.setupPlugins=function(r,p,t){var q={length:0,plugins:{}},s={length:0,plugins:{}},o=j.getPlugins();d(p.plugins,function(x,z){var y=a.getPluginName(x),A=o[y],B=A.getFlashPath(),C=A.getJS(),u=A.getURL();if(B){q.plugins[B]=a.extend({},z);q.plugins[B].pluginmode=A.getPluginmode();q.length++}try{if(C&&p.plugins&&p.plugins[u]){var v=document.createElement("div");v.id=r.id+"_"+y;v.style.position="absolute";v.style.top=0;v.style.zIndex=s.length+10;s.plugins[y]=A.getNewInstance(r,a.extend({},p.plugins[u]),v);s.length++;r.onReady(t(s.plugins[y],v,true));r.onResize(t(s.plugins[y],v))}}catch(w){a.log("ERROR: Failed to load "+y+".")}});r.plugins=s.plugins;return q};this.load=function(){if(a.exists(h)&&a.typeOf(h)!="object"){m();return}n=a.loaderstatus.LOADING;g=true;d(h,function(p){if(a.exists(p)){var q=j.addPlugin(p);q.addEventListener(c.COMPLETE,m);q.addEventListener(c.ERROR,k)}});var o=j.getPlugins();d(o,function(p,q){q.load()});g=false;m()};this.destroy=function(){if(f){f.resetEventListeners();f=null}};this.pluginFailed=k;this.getStatus=function(){return n}}})(jwplayer);(function(a){a.parsers={localName:function(b){if(!b){return""}else{if(b.localName){return b.localName}else{if(b.baseName){return b.baseName}else{return""}}}},textContent:function(b){if(!b){return""}else{if(b.textContent){return a.utils.trim(b.textContent)}else{if(b.text){return a.utils.trim(b.text)}else{return""}}}},getChildNode:function(c,b){return c.childNodes[b]},numChildren:function(b){if(b.childNodes){return b.childNodes.length}else{return 0}}}})(jwplayer);(function(b){var a=b.parsers;var d=a.jwparser=function(){};var c="jwplayer";d.parseEntry=function(l,p){var e=[],n=[],m=b.utils.xmlAttribute,f="default",q="label",j="file",o="type";for(var k=0;k<l.childNodes.length;k++){var h=l.childNodes[k];if(h.prefix==c){var g=a.localName(h);if(g=="source"){delete p.sources;e.push({file:m(h,j),"default":m(h,f),label:m(h,q),type:m(h,o)})}else{if(g=="track"){delete p.tracks;n.push({file:m(h,j),"default":m(h,f),kind:m(h,"kind"),label:m(h,q)})}else{p[g]=b.utils.serialize(a.textContent(h));if(g=="file"&&p.sources){delete p.sources}}}}if(!p[j]){p[j]=p.link}}if(e.length){p.sources=[];for(k=0;k<e.length;k++){if(e[k].file.length>0){e[k][f]=(e[k][f]=="true")?true:false;if(!e[k].label.length){delete e[k].label}p.sources.push(e[k])}}}if(n.length){p.tracks=[];for(k=0;k<n.length;k++){if(n[k].file.length>0){n[k][f]=(n[k][f]=="true")?true:false;n[k].kind=(!n[k].kind.length)?"captions":n[k].kind;if(!n[k].label.length){delete n[k].label}p.tracks.push(n[k])}}}return p}})(jwplayer);(function(e){var b=jwplayer.utils,h=b.xmlAttribute,c=e.localName,a=e.textContent,d=e.numChildren;var g=e.mediaparser=function(){};var f="media";g.parseGroup=function(o,q){var n,l,k="tracks",j=[];function p(i){var r={zh:"Chinese",nl:"Dutch",en:"English",fr:"French",de:"German",it:"Italian",ja:"Japanese",pt:"Portuguese",ru:"Russian",es:"Spanish"};if(r[i]){return r[i]}return i}for(l=0;l<d(o);l++){n=o.childNodes[l];if(n.prefix==f){if(!c(n)){continue}switch(c(n).toLowerCase()){case"content":if(h(n,"duration")){q.duration=b.seconds(h(n,"duration"))}if(d(n)>0){q=g.parseGroup(n,q)}if(h(n,"url")){if(!q.sources){q.sources=[]}q.sources.push({file:h(n,"url"),type:h(n,"type"),width:h(n,"width"),label:h(n,"label")})}break;case"title":q.title=a(n);break;case"description":q.description=a(n);break;case"guid":q.mediaid=a(n);break;case"thumbnail":if(!q.image){q.image=h(n,"url")}break;case"player":break;case"group":g.parseGroup(n,q);break;case"subtitle":var m={};m.file=h(n,"url");m.kind="captions";if(h(n,"lang").length>0){m.label=p(h(n,"lang"))}j.push(m)}}}if(!q.hasOwnProperty(k)){q[k]=[]}for(l=0;l<j.length;l++){q[k].push(j[l])}return q}})(jwplayer.parsers);(function(g){var b=jwplayer.utils,a=g.textContent,e=g.getChildNode,f=g.numChildren,d=g.localName;g.rssparser={};g.rssparser.parse=function(o){var h=[];for(var m=0;m<f(o);m++){var n=e(o,m),k=d(n).toLowerCase();if(k=="channel"){for(var l=0;l<f(n);l++){var p=e(n,l);if(d(p).toLowerCase()=="item"){h.push(c(p))}}}}return h};function c(l){var m={};for(var j=0;j<l.childNodes.length;j++){var k=l.childNodes[j];var h=d(k);if(!h){continue}switch(h.toLowerCase()){case"enclosure":m.file=b.xmlAttribute(k,"url");break;case"title":m.title=a(k);break;case"guid":m.mediaid=a(k);break;case"pubdate":m.date=a(k);break;case"description":m.description=a(k);break;case"link":m.link=a(k);break;case"category":if(m.tags){m.tags+=a(k)}else{m.tags=a(k)}break}}m=g.mediaparser.parseGroup(l,m);m=g.jwparser.parseEntry(l,m);return new jwplayer.playlist.item(m)}})(jwplayer.parsers);(function(d){var b=d.utils;var c=d._;d.playlist=function(f){var g=[];f=(c.isArray(f)?f:[f]);c.each(f,function(h){g.push(new d.playlist.item(h))});return g};d.playlist.filterPlaylist=function(h,g){var f=[];c.each(h,function(k){k=b.extend({},k);k.sources=e(k.sources,false,g);if(!k.sources.length){return}for(var i=0;i<k.sources.length;i++){k.sources[i].label=k.sources[i].label||i.toString()}f.push(k)});return f};function a(h){if(!h||!h.file){return}var f=b.trim(""+h.file);var g=h.type;if(!g){var i=b.extension(f);g=b.extensionmap.extType(i)}return b.extend({},h,{file:f,type:g})}var e=d.playlist.filterSources=function(g,i,j){var h,k=[],f=(i?d.embed.flashCanPlay:d.embed.html5CanPlay);if(!g){return}c.each(g,function(l){var m=a(l);if(!m){return}if(f(m.file,m.type,j)){h=h||m.type;if(m.type===h){k.push(m)}}});return k}})(jwplayer);(function(b){var a=b.item=function(f){var c=jwplayer.utils,e=c.extend({},a.defaults,f),g,d,h;e.tracks=(f&&c.exists(f.tracks))?f.tracks:[];if(e.sources.length===0){e.sources=[new b.source(e)]}for(g=0;g<e.sources.length;g++){h=e.sources[g]["default"];if(h){e.sources[g]["default"]=(h.toString()=="true")}else{e.sources[g]["default"]=false}e.sources[g]=new b.source(e.sources[g])}if(e.captions&&!c.exists(f.tracks)){for(d=0;d<e.captions.length;d++){e.tracks.push(e.captions[d])}delete e.captions}for(g=0;g<e.tracks.length;g++){e.tracks[g]=new b.track(e.tracks[g])}return e};a.defaults={description:undefined,image:undefined,mediaid:undefined,title:undefined,sources:[],tracks:[]}})(jwplayer.playlist);(function(b){var a=b.utils,d=b.events,c=b.parsers;b.playlist.loader=function(){var g=new d.eventdispatcher();a.extend(this,g);this.load=function(i){a.ajax(i,h,f)};function h(l){try{var n=l.responseXML.childNodes;var o="";for(var j=0;j<n.length;j++){o=n[j];if(o.nodeType!==8){break}}if(c.localName(o)==="xml"){o=o.nextSibling}if(c.localName(o)!=="rss"){e("Not a valid RSS feed");return}var k=new b.playlist(c.rssparser.parse(o));g.sendEvent(d.JWPLAYER_PLAYLIST_LOADED,{playlist:k})}catch(m){e()}}function f(i){e(i.match(/invalid/i)?"Not a valid RSS feed":"")}function e(i){g.sendEvent(d.JWPLAYER_ERROR,{message:i?i:"Error loading file"})}}})(jwplayer);(function(d){var b,a=jwplayer.utils,c={file:b,label:b,type:b,"default":b};d.source=function(f){var e=a.extend({},c);a.foreach(c,function(g){if(a.exists(f[g])){e[g]=f[g];delete f[g]}});if(e.type&&e.type.indexOf("/")>0){e.type=a.extensionmap.mimeType(e.type)}if(e.type=="m3u8"){e.type="hls"}if(e.type=="smil"){e.type="rtmp"}return e}})(jwplayer.playlist);(function(d){var b,a=jwplayer.utils,c={file:b,label:b,kind:"captions","default":false};d.track=function(e){var f=a.extend({},c);if(!e){e={}}a.foreach(c,function(g){if(a.exists(e[g])){f[g]=e[g];delete e[g]}});return f}})(jwplayer.playlist);(function(e){var c=e.utils,f=e.events,d=e._;var h=e.embed=function(s){var m=new h.config(s.config),k=m.width,B=m.height,j="Error loading player: ",u=document.getElementById(s.id),C=e.plugins.loadPlugins(s.id,m.plugins),w,q=false,y=false,t=-1,A=null,v=this;if(m.fallbackDiv){A=m.fallbackDiv;delete m.fallbackDiv}m.id=s.id;if(m.aspectratio){s.config.aspectratio=m.aspectratio}else{delete s.config.aspectratio}g(s,m.events);var n=document.createElement("div");n.id=u.id;n.style.width=k.toString().indexOf("%")>0?k:(k+"px");n.style.height=B.toString().indexOf("%")>0?B:(B+"px");u.parentNode.replaceChild(n,u);v.embed=function(){if(y){return}C.addEventListener(f.COMPLETE,p);C.addEventListener(f.ERROR,o);C.load()};v.destroy=function(){if(C){C.destroy();C=null}if(w){w.resetEventListeners();w=null}};function p(){if(y){return}var J=m.playlist;if(d.isArray(J)){if(J.length===0){r();return}if(J.length===1){if(!J[0].sources||J[0].sources.length===0||!J[0].sources[0].file){r();return}}}if(q){return}if(d.isString(J)){w=new e.playlist.loader();w.addEventListener(f.JWPLAYER_PLAYLIST_LOADED,function(K){m.playlist=K.playlist;q=false;p()});w.addEventListener(f.JWPLAYER_ERROR,function(K){q=false;r(K)});q=true;w.load(m.playlist);return}if(C.getStatus()===c.loaderstatus.COMPLETE){for(var F=0;F<m.modes.length;F++){var I=m.modes[F];var G=I.type;if(G&&h[G]){var D=c.extend({},m);var E=new h[G](n,I,D,C,s);if(E.supportsConfig()){E.addEventListener(f.ERROR,i);E.embed();a();return s}}}var H;if(m.fallback){H="No suitable players found and fallback enabled";l(H,true);c.log(H);new h.download(n,m,r)}else{H="No suitable players found and fallback disabled";l(H,false);c.log(H);x()}}}function x(){n.parentNode.replaceChild(A,n)}function i(D){z(j+D.message)}function o(D){s.dispatchEvent(f.JWPLAYER_ERROR,{message:"Could not load plugin: "+D.message})}function r(D){if(D&&D.message){z("Error loading playlist: "+D.message)}else{z(j+"No playable sources found")}}function l(D,E){clearTimeout(t);t=setTimeout(function(){s.dispatchEvent(f.JWPLAYER_SETUP_ERROR,{message:D,fallback:E})},0)}function z(D){if(y){return}if(!m.fallback){l(D,false);return}y=true;b(n,D,m);l(D,true)}v.errorScreen=z;return v};function g(j,i){c.foreach(i,function(k,m){var l=j[k];if(typeof l==="function"){l.call(j,m)}})}function a(){c.css("object.jwswf, .jwplayer:focus",{outline:"none"});c.css(".jw-tab-focus:focus",{outline:"solid 2px #0B7EF4"})}function b(i,l,j){var k=i.style;k.backgroundColor="#000";k.color="#FFF";k.width=c.styleDimension(j.width);k.height=c.styleDimension(j.height);k.display="table";k.opacity=1;var n=document.createElement("p"),m=n.style;m.verticalAlign="middle";m.textAlign="center";m.display="table-cell";m.font="15px/20px Arial, Helvetica, sans-serif";n.innerHTML=l.replace(":",":<br>");i.innerHTML="";i.appendChild(n)}e.embed.errorScreen=b})(jwplayer);(function(e){var h=e.utils,g=e.embed,i=e.playlist.item;var a=g.config=function(k){var m={fallback:true,height:270,primary:"html5",width:480,base:k.base?k.base:h.getScriptPath("jwplayer.js"),aspectratio:""},l=h.extend({},m,e.defaults,k),j={html5:{type:"html5",src:l.base+"jwplayer.html5.js"},flash:{type:"flash",src:l.base+"jwplayer.flash.swf"}};l.modes=(l.primary==="flash")?[j.flash,j.html5]:[j.html5,j.flash];if(l.listbar){l.playlistsize=l.listbar.size;l.playlistposition=l.listbar.position;l.playlistlayout=l.listbar.layout}if(l.flashplayer){j.flash.src=l.flashplayer}if(l.html5player){j.html5.src=l.html5player}d(l);f(l);return l};function f(k){var j=k.aspectratio,l=b(j);if(k.width.toString().indexOf("%")===-1){delete k.aspectratio}else{if(!l){delete k.aspectratio}else{k.aspectratio=l}}}function b(k){if(typeof k!=="string"||!h.exists(k)){return 0}var l=k.indexOf(":");if(l===-1){return 0}var j=parseFloat(k.substr(0,l)),m=parseFloat(k.substr(l+1));if(j<=0||m<=0){return 0}return(m/j*100)+"%"}a.addConfig=function(j,k){d(k);return h.extend(j,k)};function d(k){if(!k.playlist){var m={};h.foreach(i.defaults,function(n){c(k,m,n)});if(!m.sources){if(k.levels){m.sources=k.levels;delete k.levels}else{var j={};c(k,j,"file");c(k,j,"type");m.sources=j.file?[j]:[]}}k.playlist=[new i(m)]}else{for(var l=0;l<k.playlist.length;l++){k.playlist[l]=new i(k.playlist[l])}}}function c(l,j,k){if(h.exists(l[k])){j[k]=l[k];delete l[k]}}})(jwplayer);(function(d){var g=d.embed,i=d.utils,h=d.utils.css,c="none",a="block",f="100%",e="relative",b="absolute";g.download=function(m,w,k){var p=i.extend({},w),t,n=p.width?p.width:480,q=p.height?p.height:320,x,r,j=w.logo?w.logo:{prefix:i.repo(),file:"logo.png",margin:10};function v(){var C,D,B,E,I,z,y,H,A=p.playlist,F=["mp4","aac","mp3"];if(!A||!A.length){return}I=A[0];z=I.sources;for(E=0;E<z.length;E++){y=z[E];if(!y.file){continue}H=y.type||i.extensionmap.extType(i.extension(y.file));var G=i.indexOf(F,H);if(G>=0){C=y.file;D=I.image}else{if(i.isYouTube(y.file)){B=y.file}}}if(C){x=C;r=D;s();o()}else{if(B){l(B)}else{k()}}}function s(){if(m){t=u("a","display",m);u("div","icon",t);u("div","logo",t);if(x){t.setAttribute("href",i.getAbsolutePath(x))}}}function o(){var y="#"+m.id+" .jwdownload";m.style.width="";m.style.height="";h(y+"display",{width:i.styleDimension(Math.max(320,n)),height:i.styleDimension(Math.max(180,q)),background:"black center no-repeat "+(r?"url("+r+")":""),backgroundSize:"contain",position:e,border:c,display:a});h(y+"display div",{position:b,width:f,height:f});h(y+"logo",{top:j.margin+"px",right:j.margin+"px",background:"top right no-repeat url("+j.prefix+j.file+")"});h(y+"icon",{background:"center no-repeat url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAgNJREFUeNrs28lqwkAYB/CZqNVDDj2r6FN41QeIy8Fe+gj6BL275Q08u9FbT8ZdwVfotSBYEPUkxFOoks4EKiJdaDuTjMn3wWBO0V/+sySR8SNSqVRKIR8qaXHkzlqS9jCfzzWcTCYp9hF5o+59sVjsiRzcegSckFzcjT+ruN80TeSlAjCAAXzdJSGPFXRpAAMYwACGZQkSdhG4WCzehMNhqV6vG6vVSrirKVEw66YoSqDb7cqlUilE8JjHd/y1MQefVzqdDmiaJpfLZWHgXMHn8F6vJ1cqlVAkEsGuAn83J4gAd2RZymQygX6/L1erVQt+9ZPWb+CDwcCC2zXGJaewl/DhcHhK3DVj+KfKZrMWvFarcYNLomAv4aPRSFZVlTlcSPA5fDweW/BoNIqFnKV53JvncjkLns/n/cLdS+92O7RYLLgsKfv9/t8XlDn4eDyiw+HA9Jyz2eyt0+kY2+3WFC5hluej0Ha7zQQq9PPwdDq1Et1sNsx/nFBgCqWJ8oAK1aUptNVqcYWewE4nahfU0YQnk4ntUEfGMIU2m01HoLaCKbTRaDgKtaVLk9tBYaBcE/6Artdr4RZ5TB6/dC+9iIe/WgAMYADDpAUJAxjAAAYwgGFZgoS/AtNNTF7Z2bL0BYPBV3Jw5xFwwWcYxgtBP5OkE8i9G7aWGOOCruvauwADALMLMEbKf4SdAAAAAElFTkSuQmCC)"})}function u(y,B,A){var z=document.createElement(y);if(B){z.className="jwdownload"+B}if(A){A.appendChild(z)}return z}function l(y){var z=u("iframe","",m);z.src="http://www.youtube.com/embed/"+i.youTubeID(y);z.width=n;z.height=q;z.style.border="none"}v()}})(jwplayer);(function(c){var b=c.utils,d=c.events,a={};var f=c.embed.flash=function(k,l,o,j,m){var h=new c.events.eventdispatcher(),i=b.flashVersion();b.extend(this,h);function p(r,q,s){var t=document.createElement("param");t.setAttribute("name",q);t.setAttribute("value",s);r.appendChild(t)}function n(r,s,q){return function(){try{if(q){document.getElementById(m.id+"_wrapper").appendChild(s)}var u=document.getElementById(m.id).getPluginConfig("display");if(typeof r.resize==="function"){r.resize(u.width,u.height)}s.style.left=u.x;s.style.top=u.h}catch(t){}}}function g(q){if(!q){return{}}var s={},r=[];b.foreach(q,function(t,v){var u=b.getPluginName(t);r.push(t);b.foreach(v,function(x,w){s[u+"."+x]=w})});s.plugins=r.join(",");return s}this.embed=function(){o.id=m.id;if(i<10){h.sendEvent(d.ERROR,{message:"Flash version must be 10.0 or greater"});return false}var D,B,t=m.config.listbar;var w=b.extend({},o);if(k.id+"_wrapper"===k.parentNode.id){D=document.getElementById(k.id+"_wrapper")}else{D=document.createElement("div");B=document.createElement("div");B.style.display="none";B.id=k.id+"_aspect";D.id=k.id+"_wrapper";D.style.position="relative";D.style.display="block";D.style.width=b.styleDimension(w.width);D.style.height=b.styleDimension(w.height);if(m.config.aspectratio){var u=parseFloat(m.config.aspectratio);B.style.display="block";B.style.marginTop=m.config.aspectratio;D.style.height="auto";D.style.display="inline-block";if(t){if(t.position==="bottom"){B.style.paddingBottom=t.size+"px"}else{if(t.position==="right"){B.style.marginBottom=(-1*t.size*(u/100))+"px"}}}}k.parentNode.replaceChild(D,k);D.appendChild(k);D.appendChild(B)}var r=j.setupPlugins(m,w,n);if(r.length>0){b.extend(w,g(r.plugins))}else{delete w.plugins}if(typeof w["dock.position"]!=="undefined"){if(w["dock.position"].toString().toLowerCase()==="false"){w.dock=w["dock.position"];delete w["dock.position"]}}var E="#000000",z,s=w.wmode||(w.height&&w.height<=40?"transparent":"opaque"),v=["height","width","modes","events","primary","base","fallback","volume"];for(var y=0;y<v.length;y++){delete w[v[y]]}var C=b.getCookies();b.foreach(C,function(F,G){if(typeof(w[F])==="undefined"){w[F]=G}});var q=window.location.href.split("/");q.splice(q.length-1,1);q=q.join("/");w.base=q+"/";a[k.id]=w;if(b.isMSIE()){var A='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" " width="100%" height="100%"id="'+k.id+'" name="'+k.id+'" tabindex=0"">';A+='<param name="movie" value="'+l.src+'">';A+='<param name="allowfullscreen" value="true">';A+='<param name="allowscriptaccess" value="always">';A+='<param name="seamlesstabbing" value="true">';A+='<param name="wmode" value="'+s+'">';A+='<param name="bgcolor" value="'+E+'">';A+="</object>";k.outerHTML=A;z=document.getElementById(k.id)}else{var x=document.createElement("object");x.setAttribute("type","application/x-shockwave-flash");x.setAttribute("data",l.src);x.setAttribute("width","100%");x.setAttribute("height","100%");x.setAttribute("bgcolor",E);x.setAttribute("id",k.id);x.setAttribute("name",k.id);x.className="jwswf";p(x,"allowfullscreen","true");p(x,"allowscriptaccess","always");p(x,"seamlesstabbing","true");p(x,"wmode",s);k.parentNode.replaceChild(x,k);z=x}if(m.config.aspectratio){z.style.position="absolute"}m.container=z;m.setPlayer(z,"flash")};this.supportsConfig=function(){if(i){if(o){if(b.typeOf(o.playlist)==="string"){return true}try{var s=o.playlist[0],q=s.sources;if(typeof q==="undefined"){return true}else{for(var r=0;r<q.length;r++){if(q[r].file&&e(q[r].file,q[r].type)){return true}}}}catch(t){return false}}else{return true}}return false}};f.getVars=function(g){return a[g]};var e=c.embed.flashCanPlay=function(g,h){if(b.isYouTube(g)){return true}if(b.isRtmp(g,h)){return true}if(h==="hls"){return true}var i=b.extensionmap[h?h:b.extension(g)];if(!i){return false}return !!(i.flash)}})(jwplayer);(function(c){var a=c.utils,b=a.extensionmap,d=c.events;c.embed.html5=function(i,j,o,h,m){var l=this,g=new d.eventdispatcher();a.extend(l,g);function n(q,r,p){return function(){try{var s=document.querySelector("#"+i.id+" .jwmain");if(p){s.appendChild(r)}if(typeof q.resize==="function"){q.resize(s.clientWidth,s.clientHeight);setTimeout(function(){q.resize(s.clientWidth,s.clientHeight)},400)}r.left=s.style.left;r.top=s.style.top}catch(t){}}}l.embed=function(){if(c.html5){h.setupPlugins(m,o,n);i.innerHTML="";var p=c.utils.extend({},o);delete p.volume;var q=new c.html5.player(p);m.container=document.getElementById(m.id);m.setPlayer(q,"html5")}else{var r=new a.scriptloader(j.src);r.addEventListener(d.ERROR,k);r.addEventListener(d.COMPLETE,l.embed);r.load()}};function k(p){l.sendEvent(p.type,{message:"HTML5 player not found"})}l.supportsConfig=function(){if(!!c.vid.canPlayType){try{if(a.typeOf(o.playlist)==="string"){return true}else{var p=o.playlist[0].sources;for(var r=0;r<p.length;r++){var q=p[r].file,s=p[r].type;if(c.embed.html5CanPlay(q,s,o.androidhls)){return true}}}}catch(t){}}return false}};function f(g,h,j){if(navigator.userAgent.match(/BlackBerry/i)!==null){return false}if(h==="youtube"||a.isYouTube(g)){return true}var l=a.extension(g);h=h||b.extType(l);if(h==="hls"){if(j){var k=a.isAndroidNative;if(k(2)||k(3)||k("4.0")){return false}else{if(a.isAndroid()){return true}}}else{if(a.isAndroid()){return false}}}if(a.isRtmp(g,h)){return false}var i=b[h]||b[l];if(!i){return false}if(i.flash&&!i.html5){return false}return e(i.html5)}function e(h){if(!h){return true}try{var g=c.vid.canPlayType(h);return !!g}catch(i){}return false}c.embed.html5CanPlay=f})(jwplayer);(function(f,e){var b=[],j=f.utils,k=f.events,l=k.state;function i(m){j.addClass(m,"jw-tab-focus")}function d(m){j.removeClass(m,"jw-tab-focus")}var c=["getBuffer","getCaptionsList","getControls","getCurrentCaptions","getCurrentQuality","getCurrentAudioTrack","getDuration","getFullscreen","getHeight","getLockState","getMute","getPlaylistIndex","getSafeRegion","getPosition","getQualityLevels","getState","getVolume","getWidth","isBeforeComplete","isBeforePlay","releaseState"];var h=["playlistNext","stop","forceState","playlistPrev","seek","setCurrentCaptions","setControls","setCurrentQuality","setVolume","setCurrentAudioTrack"];var g={onBufferChange:k.JWPLAYER_MEDIA_BUFFER,onBufferFull:k.JWPLAYER_MEDIA_BUFFER_FULL,onError:k.JWPLAYER_ERROR,onSetupError:k.JWPLAYER_SETUP_ERROR,onFullscreen:k.JWPLAYER_FULLSCREEN,onMeta:k.JWPLAYER_MEDIA_META,onMute:k.JWPLAYER_MEDIA_MUTE,onPlaylist:k.JWPLAYER_PLAYLIST_LOADED,onPlaylistItem:k.JWPLAYER_PLAYLIST_ITEM,onPlaylistComplete:k.JWPLAYER_PLAYLIST_COMPLETE,onReady:k.API_READY,onResize:k.JWPLAYER_RESIZE,onComplete:k.JWPLAYER_MEDIA_COMPLETE,onSeek:k.JWPLAYER_MEDIA_SEEK,onTime:k.JWPLAYER_MEDIA_TIME,onVolume:k.JWPLAYER_MEDIA_VOLUME,onBeforePlay:k.JWPLAYER_MEDIA_BEFOREPLAY,onBeforeComplete:k.JWPLAYER_MEDIA_BEFORECOMPLETE,onDisplayClick:k.JWPLAYER_DISPLAY_CLICK,onControls:k.JWPLAYER_CONTROLS,onQualityLevels:k.JWPLAYER_MEDIA_LEVELS,onQualityChange:k.JWPLAYER_MEDIA_LEVEL_CHANGED,onCaptionsList:k.JWPLAYER_CAPTIONS_LIST,onCaptionsChange:k.JWPLAYER_CAPTIONS_CHANGED,onAdError:k.JWPLAYER_AD_ERROR,onAdClick:k.JWPLAYER_AD_CLICK,onAdImpression:k.JWPLAYER_AD_IMPRESSION,onAdTime:k.JWPLAYER_AD_TIME,onAdComplete:k.JWPLAYER_AD_COMPLETE,onAdCompanions:k.JWPLAYER_AD_COMPANIONS,onAdSkipped:k.JWPLAYER_AD_SKIPPED,onAdPlay:k.JWPLAYER_AD_PLAY,onAdPause:k.JWPLAYER_AD_PAUSE,onAdMeta:k.JWPLAYER_AD_META,onCast:k.JWPLAYER_CAST_SESSION,onAudioTrackChange:k.JWPLAYER_AUDIO_TRACK_CHANGED,onAudioTracks:k.JWPLAYER_AUDIO_TRACKS};var a={onBuffer:l.BUFFERING,onPause:l.PAUSED,onPlay:l.PLAYING,onIdle:l.IDLE};f.api=function(z){var C=this,m={},s={},p,F=false,w=[],D,n,y={},u={};C.container=z;C.id=z.id;C.setup=function(H){if(f.embed){var I=document.getElementById(C.id);if(I){H.fallbackDiv=I}t(C);var J=f(C.id);J.config=H;n=new f.embed(J);n.embed();return J}return C};C.getContainer=function(){return C.container};C.addButton=function(J,H,I,M){try{u[M]=I;var L='jwplayer("'+C.id+'").callback("'+M+'")';B("jwDockAddButton",J,H,L,M)}catch(K){j.log("Could not add dock button"+K.message)}};C.removeButton=function(H){B("jwDockRemoveButton",H)};C.callback=function(H){if(u[H]){u[H]()}};C.getMeta=function(){return C.getItemMeta()};C.getPlaylist=function(){var H=B("jwGetPlaylist");if(C.renderingMode==="flash"){j.deepReplaceKeyName(H,["__dot__","__spc__","__dsh__","__default__"],["."," ","-","default"])}return H};C.getPlaylistItem=function(H){if(!j.exists(H)){H=C.getPlaylistIndex()}return C.getPlaylist()[H]};C.getRenderingMode=function(){return C.renderingMode};C.setFullscreen=function(H){if(!j.exists(H)){B("jwSetFullscreen",!B("jwGetFullscreen"))}else{B("jwSetFullscreen",H)}return C};C.setMute=function(H){if(!j.exists(H)){B("jwSetMute",!B("jwGetMute"))}else{B("jwSetMute",H)}return C};C.lock=function(){return C};C.unlock=function(){return C};C.load=function(H){B("jwInstreamDestroy");if(f(C.id).plugins.googima){B("jwDestroyGoogima")}B("jwLoad",H);return C};C.playlistItem=function(H){B("jwPlaylistItem",parseInt(H,10));return C};C.resize=function(J,H){if(C.renderingMode!=="flash"){B("jwResize",J,H)}else{var K=document.getElementById(C.id+"_wrapper"),I=document.getElementById(C.id+"_aspect");if(I){I.style.display="none"}if(K){K.style.display="block";K.style.width=j.styleDimension(J);K.style.height=j.styleDimension(H)}}return C};C.play=function(H){if(H!==e){B("jwPlay",H);return C}H=C.getState();var I=D&&D.getState();if(I){if(I===l.IDLE||I===l.PLAYING||I===l.BUFFERING){B("jwInstreamPause")}else{B("jwInstreamPlay")}}else{if(H===l.PLAYING||H===l.BUFFERING){B("jwPause")}else{B("jwPlay")}}return C};C.pause=function(H){if(H===e){H=C.getState();if(H===l.PLAYING||H===l.BUFFERING){B("jwPause")}else{B("jwPlay")}}else{B("jwPause",H)}return C};C.createInstream=function(){return new f.api.instream(this,p)};C.setInstream=function(H){D=H;return H};C.loadInstream=function(I,H){D=C.setInstream(C.createInstream()).init(H);D.loadItem(I);return D};C.destroyPlayer=function(){B("jwPlayerDestroy")};C.playAd=function(I){var H=f(C.id).plugins;if(H.vast){H.vast.jwPlayAd(I)}else{B("jwPlayAd",I)}};C.pauseAd=function(){var H=f(C.id).plugins;if(H.vast){H.vast.jwPauseAd()}else{B("jwPauseAd")}};function v(H,I){j.foreach(H,function(J,K){C[J]=function(L){return I(K,L)}})}v(a,x);v(g,E);function q(H,I){var J="jw"+I.charAt(0).toUpperCase()+I.slice(1);C[I]=function(){var K=B.apply(this,[J].concat(Array.prototype.slice.call(arguments,0)));return(H?C:K)}}var o=function(I,H){q(false,H)};var A=function(I,H){q(true,H)};j.foreach(c,o);j.foreach(h,A);C.remove=function(){if(!F){throw"Cannot call remove() before player is ready"}t(this)};function t(H){w=[];if(n&&n.destroy){n.destroy()}f.api.destroyPlayer(H.id)}C.registerPlugin=function(K,J,I,H){f.plugins.registerPlugin(K,J,I,H)};C.setPlayer=function(H,I){p=H;C.renderingMode=I};C.detachMedia=function(){if(C.renderingMode==="html5"){return B("jwDetachMedia")}};C.attachMedia=function(H){if(C.renderingMode==="html5"){return B("jwAttachMedia",H)}};C.getAudioTracks=function(){return B("jwGetAudioTracks")};function x(H,I){if(!s[H]){s[H]=[];E(k.JWPLAYER_PLAYER_STATE,G(H))}s[H].push(I);return C}function G(H){return function(J){var I=J.newstate,M=J.oldstate;if(I===H){var L=s[I];if(L){for(var N=0;N<L.length;N++){var K=L[N];if(typeof K==="function"){K.call(this,{oldstate:M,newstate:I})}}}}}}function r(H,I){try{H.jwAddEventListener(I,'function(dat) { jwplayer("'+C.id+'").dispatchEvent("'+I+'", dat); }')}catch(J){j.log("Could not add internal listener")}}function E(H,I){if(!m[H]){m[H]=[];if(p&&F){r(p,H)}}m[H].push(I);return C}C.removeEventListener=function(J,K){var I=m[J];if(I){for(var H=I.length;H--;){if(I[H]===K){I.splice(H,1)}}}};C.dispatchEvent=function(L){var K=m[L];if(K){K=K.slice(0);var I=j.translateEventResponse(L,arguments[1]);for(var H=0;H<K.length;H++){var J=K[H];if(typeof J==="function"){try{if(L===k.JWPLAYER_PLAYLIST_LOADED){j.deepReplaceKeyName(I.playlist,["__dot__","__spc__","__dsh__","__default__"],["."," ","-","default"])}J.call(this,I)}catch(M){j.log("There was an error calling back an event handler",M)}}}}};C.dispatchInstreamEvent=function(H){if(D){D.dispatchEvent(H,arguments)}};function B(){if(F){if(p){var H=Array.prototype.slice.call(arguments,0),I=H.shift();if(typeof p[I]==="function"){switch(H.length){case 6:return p[I](H[0],H[1],H[2],H[3],H[4],H[5]);case 5:return p[I](H[0],H[1],H[2],H[3],H[4]);case 4:return p[I](H[0],H[1],H[2],H[3]);case 3:return p[I](H[0],H[1],H[2]);case 2:return p[I](H[0],H[1]);case 1:return p[I](H[0])}return p[I]()}}return null}w.push(arguments)}C.callInternal=B;C.playerReady=function(H){F=true;if(!p){C.setPlayer(document.getElementById(H.id))}C.container=document.getElementById(C.id);j.foreach(m,function(I){r(p,I)});E(k.JWPLAYER_PLAYLIST_ITEM,function(){y={}});E(k.JWPLAYER_MEDIA_META,function(I){j.extend(y,I.metadata)});E(k.JWPLAYER_VIEW_TAB_FOCUS,function(J){var I=C.getContainer();if(J.hasFocus===true){i(I)}else{d(I)}});C.dispatchEvent(k.API_READY);while(w.length>0){B.apply(this,w.shift())}};C.getItemMeta=function(){return y};return C};f.playerReady=function(n){var m=f.api.playerById(n.id);if(!m){m=f.api.selectPlayer(n.id)}m.playerReady(n)};f.api.selectPlayer=function(n){var m;if(!j.exists(n)){n=0}if(n.nodeType){m=n}else{if(typeof n==="string"){m=document.getElementById(n)}}if(m){var o=f.api.playerById(m.id);if(o){return o}else{return f.api.addPlayer(new f.api(m))}}else{if(typeof n==="number"){return b[n]}}return null};f.api.playerById=function(n){for(var m=0;m<b.length;m++){if(b[m].id===n){return b[m]}}return null};f.api.addPlayer=function(m){for(var n=0;n<b.length;n++){if(b[n]===m){return m}}b.push(m);return m};f.api.destroyPlayer=function(o){var n,p,m;j.foreach(b,function(r,s){if(s.id===o){n=r;p=s}});if(n===e||p===e){return null}j.clearCss("#"+p.id);m=document.getElementById(p.id+(p.renderingMode==="flash"?"_wrapper":""));if(m){if(p.renderingMode==="html5"){p.destroyPlayer()}var q=document.createElement("div");q.id=p.id;m.parentNode.replaceChild(q,m)}b.splice(n,1);return null}})(window.jwplayer);(function(c){var d=c.events,a=c.utils,b=d.state;c.api.instream=function(j,e){var i,k,h={},o={},f=this;function m(q,p){e.jwInstreamAddEventListener(p,'function(dat) { jwplayer("'+q+'").dispatchInstreamEvent("'+p+'", dat); }')}function g(p,q){if(!h[p]){h[p]=[];m(j.id,p)}h[p].push(q);return this}function n(p,q){if(!o[p]){o[p]=[];g(d.JWPLAYER_PLAYER_STATE,l(p))}o[p].push(q);return this}function l(p){return function(r){var q=r.newstate,u=r.oldstate;if(q===p){var t=o[q];if(t){for(var v=0;v<t.length;v++){var s=t[v];if(typeof s==="function"){s.call(this,{oldstate:u,newstate:q,type:r.type})}}}}}}f.type="instream";f.init=function(){j.callInternal("jwInitInstream");return f};f.loadItem=function(q,p){i=q;k=p||{};if(a.typeOf(q)==="array"){j.callInternal("jwLoadArrayInstream",i,k)}else{j.callInternal("jwLoadItemInstream",i,k)}};f.removeEvents=function(){h=o={}};f.removeEventListener=function(r,s){var q=h[r];if(q){for(var p=q.length;p--;){if(q[p]===s){q.splice(p,1)}}}};f.dispatchEvent=function(u,t){var s=h[u];if(s){s=s.slice(0);var q=a.translateEventResponse(u,t[1]);for(var p=0;p<s.length;p++){var r=s[p];if(typeof r==="function"){r.call(this,q)}}}};f.onError=function(p){return g(d.JWPLAYER_ERROR,p)};f.onMediaError=function(p){return g(d.JWPLAYER_MEDIA_ERROR,p)};f.onFullscreen=function(p){return g(d.JWPLAYER_FULLSCREEN,p)};f.onMeta=function(p){return g(d.JWPLAYER_MEDIA_META,p)};f.onMute=function(p){return g(d.JWPLAYER_MEDIA_MUTE,p)};f.onComplete=function(p){return g(d.JWPLAYER_MEDIA_COMPLETE,p)};f.onPlaylistComplete=function(p){return g(d.JWPLAYER_PLAYLIST_COMPLETE,p)};f.onPlaylistItem=function(p){return g(d.JWPLAYER_PLAYLIST_ITEM,p)};f.onTime=function(p){return g(d.JWPLAYER_MEDIA_TIME,p)};f.onBuffer=function(p){return n(b.BUFFERING,p)};f.onPause=function(p){return n(b.PAUSED,p)};f.onPlay=function(p){return n(b.PLAYING,p)};f.onIdle=function(p){return n(b.IDLE,p)};f.onClick=function(p){return g(d.JWPLAYER_INSTREAM_CLICK,p)};f.onInstreamDestroyed=function(p){return g(d.JWPLAYER_INSTREAM_DESTROYED,p)};f.onAdSkipped=function(p){return g(d.JWPLAYER_AD_SKIPPED,p)};f.play=function(p){e.jwInstreamPlay(p)};f.pause=function(p){e.jwInstreamPause(p)};f.hide=function(){j.callInternal("jwInstreamHide")};f.destroy=function(){f.removeEvents();j.callInternal("jwInstreamDestroy")};f.setText=function(p){e.jwInstreamSetText(p?p:"")};f.getState=function(){return e.jwInstreamState()};f.setClick=function(p){if(e.jwInstreamClick){e.jwInstreamClick(p)}}}})(jwplayer)};
define("jwplayer", function(){});

define('app',[
    'jquery'
    , 'underscore'
    , 'backbone'
    , 'bootstrap'
], function(
    $
    , _
    , Backbone
    ) {
    

    var App = {
        root: '/'
        , api: ''
        , site: null
        , setTitle: function(title){
            document.title = title + ' - ' + (this.site.get('college_name') || this.site.get('title'));
        }
        , host: function(){
            var loc = window.location;
            return loc.protocol + loc.hostname + ((location.port && location.port != '80') ? ':' + location.port : '');
        }
        , initialize: function(callback){
            _.extend(this, Backbone.Events);
//      // Patch Model and Collection.
//      _.each(["Model", "Collection"], function(name) {
//        // Cache Backbone constructor.
//        var ctor = Backbone[name];
//        // Cache original fetch.
//        var fetch = ctor.prototype.fetch;
//
//        // Override the fetch method to emit a fetch event.
//        ctor.prototype.fetch = function(options) {
//          var _options = _.defaults({
//            progress: function(event){
//              if(event.lengthComputable) {
//                //calculate the percentage loaded
//                var pct = (event.loaded / event.total).toFixed(1);
//                console.log(pct);
//              }
//              //this usually happens when Content-Length isn't set
//              else {
//                console.warn('Content Length not reported!');
//              }
//            }
//          }, options);
//          return fetch.call(this, _options);
//        };
//      });

            this.trigger("app:initialize");
        }

    };


    return App;
});

define('modules/library/models/site',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , url: app.api + '/siteindex/siteinfo/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});
/**
 * @license RequireJS text 2.0.12 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
 define, window, process, Packages,
 java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.12',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                    name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                    text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                        parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                        "define(function () { return '" +
                        content +
                        "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
            //Use a '.js' file name so that it indicates it is a
            //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
        typeof process !== "undefined" &&
        process.versions &&
        !!process.versions.node &&
        !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
        text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
        typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
        typeof Components !== 'undefined' && Components.classes &&
        Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                    .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                    .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                    Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});

define('text!modules/layout/templates/default.html',[],function () { return '<div id="site-nav">\r\n    <div class="container">\r\n        <ul class="site-nav-list">\r\n            <li><a href="#!/">首页</a></li>\r\n        </ul>\r\n        <ul class="user-nav-list">\r\n            <% if(site.username){ %>\r\n            <li>欢迎你，<%-site.username%></li>\r\n            <% }else{ %>\r\n            <li><a href="#!/signin/">登录</a>&nbsp;|&nbsp;</li>\r\n            <li><a href="#!/signup/">注册</a></li>\r\n            <% } %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<div id="header">\r\n    <div class="container">\r\n        <div class="header-inner">\r\n            <div class="brand">\r\n                <div class="logo"><a href="#!/"><img src="<%=site.pic%>" alt="<%=site.title%>"/></a></div>\r\n                <h1><a href="#!/"><%=site.title%></a><small><%= site.en_title ? site.en_title : "POWER BY <em>OCLASS</em>" %></small></h1>\r\n            </div>\r\n            <form class="search-form" id="search-form">\r\n                <input type="text" name="keyword" class="form-control" placeholder="搜索视频、音频、PPT、文档等教育资源"/>\r\n                <button type="submit" class="btn btn-search"><i class="icon icon-search"></i></button>\r\n            </form>\r\n        </div>\r\n    </div>\r\n</div>\r\n<div id="main-nav">\r\n    <div class="container">\r\n        <ul class="main-nav-list">\r\n            <li><a href="#!/">首页</a></li>\r\n            <% _.each(site.category,function(cate){ %>\r\n            <li <%= cateid==cate.id ? \' class="active"\' : \'\'%>><a href="#!/category/<%=cate.id%>/"><%=cate.name%></a></li>\r\n            <% }) %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<div id="container"></div>\r\n<% if(site.links){ %>\r\n<div id="links">\r\n    <div class="container">\r\n        <h3>网站链接</h3>\r\n        <ul class="link-list">\r\n            <% _.each(site.links, function(link){%>\r\n            <li><a href="<%=link.link%>" target="_blank" data-bypass="true"><img src="<%=link.pic%>" alt="<%=link.name%>"/></a></li>\r\n            <% }) %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<% } %>\r\n<div id="footer">\r\n    <div class="container">\r\n        <div class="copyright"><%=site.copyright%></div>\r\n    </div>\r\n</div>';});

define('modules/layout/views/default',[
    'app'
    , 'text!modules/layout/templates/default.html'
    ],function(
        app
        , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , events: {
            'submit #search-form': 'search'
        }
        , initialize: function(options){
            this.options = options || {};
            this.render();
        }
        , render: function(){
            this.$el.html(this.template({
                site: app.site.toJSON(),
                cateid: _.result(this.options.page, 'cateid')
            }));
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }
    });
    return View;
});

define('text!modules/layout/templates/search.html',[],function () { return '<div id="site-nav">\r\n    <div class="container">\r\n        <div class="brand">\r\n            <div class="logo"><a href="#!/"><img src="<%=site.pic%>" alt="<%=site.title%>"/></a></div>\r\n            <h1><a href="#!/"><%=site.title%></a></h1>\r\n        </div>\r\n        <ul class="user-nav-list">\r\n            <% if(site.username){ %>\r\n            <li>欢迎你，<%-site.username%></li>\r\n            <% }else{ %>\r\n            <li><a href="#!/signin/">登录</a>&nbsp;|&nbsp;</li>\r\n            <li><a href="#!/signup/">注册</a></li>\r\n            <% } %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<div id="container"></div>\r\n<% if(site.links){ %>\r\n<div id="links">\r\n    <div class="container">\r\n        <h3>网站链接</h3>\r\n        <ul class="link-list">\r\n            <% _.each(site.links, function(link){%>\r\n            <li><a href="<%=link.link%>" target="_blank" data-bypass="true"><img src="<%=link.pic%>" alt="<%=link.name%>"/></a></li>\r\n            <% }) %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<% } %>\r\n<div id="footer">\r\n    <div class="container">\r\n        <div class="copyright"><%=site.copyright%></div>\r\n    </div>\r\n</div>';});

define('modules/layout/views/search',[
    'app'
    , 'text!modules/layout/templates/search.html'
    ],function(
        app
        , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , events: {
            'submit #search-form': 'search'
        }
        , initialize: function(options){
            this.options = options || {};
            this.render();
        }
        , render: function(){
            this.$el.html(this.template({
                site: app.site.toJSON(),
                cateid: _.result(this.options.page, 'cateid')
            }));
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }
    });
    return View;
});
define('modules/library/models/index',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , url: app.api + '/totalindex/index/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});

define('text!modules/library/templates/index.html',[],function () { return '<div id="header">\r\n    <div class="container">\r\n        <div class="header-inner">\r\n            <div class="brand">\r\n                <div class="logo"><a href="#!/"><img src="assets/images/logo.png" alt="数图教育视频资源总平台"/></a></div>\r\n                <h1><a href="#!/"><em>数图</em>教育视频资源总平台</a><small>POWER BY <em>OCLASS</em></small></h1>\r\n            </div>\r\n            <form class="search-form" id="search-form">\r\n                <input type="text" name="keyword" class="form-control" placeholder="搜索视频、音频、PPT、文档等教育资源"/>\r\n                <button type="submit" class="btn btn-search"><i class="icon icon-search"></i></button>\r\n            </form>\r\n        </div>\r\n    </div>\r\n</div>\r\n<div id="main-nav">\r\n    <div class="container">\r\n        <ul class="main-nav-list">\r\n            <li><a href="#!/">首页</a></li>\r\n            <% _.each(site.library,function(lib){ %>\r\n            <li><a href="<%=lib.host%>/"><%=lib.name%></a></li>\r\n            <% }) %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<div id="container">\r\n    <div id="slide">\r\n        <div class="rank-panel">\r\n            <div class="tit">\r\n                <ul class="switch">\r\n                    <li class="active"><a href="javascript:;" data-target="#rank-tophits" data-toggle="tab">点击排行</a></li>\r\n                    <li><a href="javascript:;" data-target="#rank-newest" data-toggle="tab">最新添加</a></li>\r\n                </ul>\r\n            </div>\r\n            <div class="tab-content cnt">\r\n                <ol class="tab-pane active rank-list" id="rank-tophits">\r\n                    <% _.each(index.tophits, function(item, i){ %>\r\n                    <li<%= i<3 ? \' class="top"\':\'\' %>><a href="#!/resource/<%=item.id%>/"><span class="num"><%= i<9 ? \'0\'+(i + 1) : i + 1 %></span><%=item.title%></a></li>\r\n                    <% }) %>\r\n                </ol>\r\n                <ol class="tab-pane rank-list" id="rank-newest">\r\n                    <% _.each(index.newest, function(item, i){ %>\r\n                    <li<%= i<3 ? \' class="top"\':\'\' %>><a href="#!/resource/<%=item.id%>/"><span class="num"><%= i<9 ? \'0\'+(i + 1) : i + 1 %></span><%=item.title%></a></li>\r\n                    <% }) %>\r\n                </ol>\r\n            </div>\r\n        </div>\r\n        <div id="carousel-generic" class="carousel slide" data-ride="carousel">\r\n            <ol class="carousel-indicators">\r\n                <% _.each(index.ppts, function(res, i){%>\r\n                <li data-target="#carousel-generic" data-slide-to="<%=i%>" <%= i==0?\'class="active"\':\'\'%>>\r\n                <img src="<%=res.pic%>" alt="<%=res.title%>">\r\n                </li>\r\n                <% }) %>\r\n            </ol>\r\n            <div class="carousel-inner">\r\n                <% _.each(index.ppts, function(res, i){%>\r\n                <div class="item <%= i==0?\'active\':\'\'%>" style="background-color: <%= (res.comments && res.comments.bg_color) ? res.comments.bg_color : \'#000000\'%>">\r\n                    <a href="#!/resource/<%=res.id%>/">\r\n                        <img src="<%-res.recommend_pic%>" alt="<%-res.title%>">\r\n                        <div class="carousel-caption">\r\n                            <h2><%-res.comments.ppt_title%></h2>\r\n                            <p><%-res.comments.ppt_subtitle%></p>\r\n                        </div>\r\n                    </a>\r\n                </div>\r\n                <% }) %>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <% if(index.bigpic || index.smallpic){ %>\r\n    <div id="recommend">\r\n        <div class="container">\r\n            <h2>精品推荐</h2>\r\n            <ul class="thumb-list">\r\n                <% if(index.bigpic){ %>\r\n                <li class="lg">\r\n                    <a href="#!/resource/<%-index.bigpic[0].id%>/" class="thumb"><img src="<%-index.bigpic[0].recommend_pic%>" alt="<%=index.bigpic[0].title%>"/></a>\r\n                    <a href="#!/resource/<%-index.bigpic[0].id%>/" class="intro"><%-index.bigpic[0].title%></a>\r\n                </li>\r\n                <% } %>\r\n                <% if(index.smallpic){ %>\r\n                <% _.each(index.smallpic, function(res, i){ %>\r\n                <li>\r\n                    <a href="#!/resource/<%=res.id%>/" class="thumb"><img src="<%=res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                    <a href="#!/resource/<%=res.id%>/" class="intro"><%=res.title%></a>\r\n                </li>\r\n                <% }) %>\r\n                <% } %>\r\n            </ul>\r\n        </div>\r\n    </div>\r\n    <% } %>\r\n    <% if(index.recommend){ %>\r\n    <div id="classes">\r\n        <% _.each(index.recommend, function(cate){ %>\r\n        <div class="library-cate">\r\n            <div class="container">\r\n                <ul class="thumb-list">\r\n                    <li class="title">\r\n                        <a href="<%-cate.host%>">\r\n                            <h3><%=cate.title%></h3>\r\n                            <h4></h4>\r\n                            <div class="more">更多 &gt;&gt;</div>\r\n                        </a>\r\n                    </li>\r\n                    <% _.each(cate.list, function(res, i){ %>\r\n                    <% if(i+1 <= 14){ %>\r\n                    <li>\r\n                        <a href="<%-cate.host%>/#!/resource/<%-res.id%>/" class="thumb"><img src="<%-res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                        <a href="<%-cate.host%>/#!/resource/<%-res.id%>/" class="intro"><%=res.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }) %>\r\n                </ul>\r\n                <% if(cate.list && cate.list.length > 14){ %>\r\n                <ul class="thumb-list resource-more" style="display: none">\r\n                    <% _.each(cate.list, function(res, i){ %>\r\n                    <% if(i+1 > 14){ %>\r\n                    <li>\r\n                        <a href="<%-cate.host%>/#!/resource/<%-res.id%>/" class="thumb"><img src="<%-res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                        <a href="<%-cate.host%>/#!/resource/<%-res.id%>/" class="intro"><%=res.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }); %>\r\n                </ul>\r\n                <div class="more-btn"><a href="javascript:void(0)">查看更多 <i class="icon icon-arrow-circle-down"></i></a></div>\r\n                <% } %>\r\n            </div>\r\n        </div>\r\n        <% }) %>\r\n    </div>\r\n    <% } %>\r\n</div>\r\n<% if(site.links){ %>\r\n<div id="links">\r\n    <div class="container">\r\n        <h3>网站链接</h3>\r\n        <ul class="link-list">\r\n            <% _.each(site.links, function(link){%>\r\n            <li><a href="<%=link.link%>" target="_blank" data-bypass="true"><img src="<%=link.pic%>" alt="<%=link.name%>"/></a></li>\r\n            <% }) %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<% } %>\r\n<div id="footer">\r\n    <div class="container">\r\n        <div class="copyright"><%=site.copyright%></div>\r\n    </div>\r\n</div>';});

define('modules/library/views/index',[
    'app'
    , 'text!modules/library/templates/index.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        title: '首页'
        , template: _.template(template)
        , events: {
            'submit #search-form': 'search'
            , 'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({index: this.model.toJSON(), site: this.options.site}));
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }

    });
    return View;
});
define('modules/library/models/library',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , url: app.api + '/siteindex/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});

define('text!modules/library/templates/library.html',[],function () { return '<div id="slide">\r\n    <div class="rank-panel">\r\n        <div class="tit">\r\n            <ul class="switch">\r\n                <li class="active"><a href="javascript:;" data-target="#rank-tophits" data-toggle="tab">点击排行</a></li>\r\n                <li><a href="javascript:;" data-target="#rank-newest" data-toggle="tab">最新添加</a></li>\r\n            </ul>\r\n        </div>\r\n        <div class="tab-content cnt">\r\n            <ol class="tab-pane active rank-list" id="rank-tophits">\r\n                <% _.each(tophits, function(item, i){ %>\r\n                <li<%= i<3 ? \' class="top"\':\'\' %>><a href="#!/resource/<%=item.id%>/"><span class="num"><%= i<9 ? \'0\'+(i + 1) : i + 1 %></span><%=item.title%></a></li>\r\n                <% }) %>\r\n            </ol>\r\n            <ol class="tab-pane rank-list" id="rank-newest">\r\n                <% _.each(newest, function(item, i){ %>\r\n                <li<%= i<3 ? \' class="top"\':\'\' %>><a href="#!/resource/<%=item.id%>/"><span class="num"><%= i<9 ? \'0\'+(i + 1) : i + 1 %></span><%=item.title%></a></li>\r\n                <% }) %>\r\n            </ol>\r\n        </div>\r\n    </div>\r\n    <div id="carousel-generic" class="carousel slide" data-ride="carousel">\r\n        <ol class="carousel-indicators">\r\n            <% _.each(ppts, function(res, i){%>\r\n            <li data-target="#carousel-generic" data-slide-to="<%=i%>" <%= i==0?\'class="active"\':\'\'%>>\r\n            <img src="<%=res.pic%>" alt="<%=res.title%>">\r\n            </li>\r\n            <% }) %>\r\n        </ol>\r\n        <div class="carousel-inner">\r\n            <% _.each(ppts, function(res, i){%>\r\n            <div class="item <%= i==0?\'active\':\'\'%>" style="background-color: <%= (res.comments && res.comments.bg_color) ? res.comments.bg_color : \'#000000\'%>">\r\n                <a href="#!/resource/<%=res.id%>/">\r\n                    <img src="<%-res.recommend_pic%>" alt="<%-res.title%>">\r\n                    <div class="carousel-caption">\r\n                        <h2><%-res.comments.ppt_title%></h2>\r\n                        <p><%-res.comments.ppt_subtitle%></p>\r\n                    </div>\r\n                </a>\r\n            </div>\r\n            <% }) %>\r\n        </div>\r\n    </div>\r\n</div>\r\n<% if(bigpic || smallpic){ %>\r\n<div id="recommend">\r\n    <div class="container">\r\n        <h2>精品推荐</h2>\r\n        <ul class="thumb-list">\r\n            <% if(bigpic){ %>\r\n            <li class="lg">\r\n                <a href="#!/resource/<%=bigpic[0].id%>/" class="thumb"><img src="<%=bigpic[0].recommend_pic%>" alt="<%=bigpic[0].title%>"/></a>\r\n                <a href="#!/resource/<%=bigpic[0].id%>/" class="intro"><%=bigpic[0].title%></a>\r\n            </li>\r\n            <% } %>\r\n            <% if(smallpic){ %>\r\n            <% _.each(smallpic, function(res, i){ %>\r\n            <li>\r\n                <a href="#!/resource/<%=res.id%>/" class="thumb"><img src="<%=res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                <a href="#!/resource/<%=res.id%>/" class="intro"><%=res.title%></a>\r\n            </li>\r\n            <% }) %>\r\n            <% } %>\r\n        </ul>\r\n    </div>\r\n</div>\r\n<% } %>\r\n<% if(recommend){ %>\r\n<div id="classes">\r\n    <% _.each(recommend, function(cate){ %>\r\n    <div class="class-cate">\r\n        <div class="container">\r\n            <ul class="thumb-list">\r\n                <li class="title">\r\n                    <a href="#!/category/<%=cate.id%>/">\r\n                        <h3><%=cate.name%></h3>\r\n                        <h4></h4>\r\n                        <div class="more">更多 &gt;&gt;</div>\r\n                    </a>\r\n                </li>\r\n                <% _.each(cate.list, function(res, index){ %>\r\n                <% if(index+1 <= 14){ %>\r\n                <li>\r\n                    <a href="#!/resource/<%=res.id%>/" class="thumb"><img src="<%=res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                    <a href="#!/resource/<%=res.id%>/" class="intro"><%=res.title%></a>\r\n                </li>\r\n                <% } %>\r\n                <% }) %>\r\n            </ul>\r\n            <% if(cate.list && cate.list.length > 14){ %>\r\n            <ul class="thumb-list resource-more" style="display: none">\r\n                <% _.each(cate.list, function(res, index){ %>\r\n                <% if(index+1 > 14){ %>\r\n                <li>\r\n                    <a href="#!/resource/<%=res.id%>/" class="thumb"><img src="<%=res.recommend_pic%>" alt="<%=res.title%>"/></a>\r\n                    <a href="#!/resource/<%=res.id%>/" class="intro"><%=res.title%></a>\r\n                </li>\r\n                <% } %>\r\n                <% }); %>\r\n            </ul>\r\n            <div class="more-btn"><a href="javascript:void(0)">查看更多 <i class="icon icon-arrow-circle-down"></i></a></div>\r\n            <% } %>\r\n        </div>\r\n    </div>\r\n    <% }) %>\r\n</div>\r\n<% } %>\r\n';});

define('modules/library/views/library',[
    'app'
    , 'text!modules/library/templates/library.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        title: '首页'
        , template: _.template(template)
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(){
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});
define('modules/library/models/category',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/category/'
        , parse: function(response){
            this.page = response.page;
            this.pagesize = response.pagesize;
            this.pages = Math.ceil(response.total / response.pagesize);
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});

define('text!modules/library/templates/category.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li><a href="#!/">分类</a></li>\r\n            <li class="active"><%=category.category.prarent.name%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="category">\r\n    <div class="container">\r\n        <h1><%=category.category.prarent.name%></h1>\r\n        <ul class="thumb-list">\r\n            <% _.each(category.list, function(res){%>\r\n            <li>\r\n                <a href="#!/resource/<%=res.id%>/" class="thumb"><img src="<%=res.pic%>" alt="<%=res.title%>"/></a>\r\n                <a href="#!/resource/<%=res.id%>/" class="intro"><%=res.title%></a>\r\n            </li>\r\n            <% }) %>\r\n        </ul>\r\n        <% if(pages > 1){ %>\r\n        <div class="text-center">\r\n            <ul class="pagination">\r\n                <li <%= current_page==1?\'class="disabled"\':\'\' %>><a href="#!/category/<%=cid%>/1/">&lt;</a></li>\r\n                <% for(var i=1; i<=pages; i++){ %>\r\n                <li <%= current_page==i?\'class="active"\':\'\' %>><a href="#!/category/<%=cid%>/<%=i%>/"><%=i%></a></li>\r\n                <% } %>\r\n                <li <%= current_page==pages?\'class="disabled"\':\'\' %>><a href="#!/category/<%=cid%>/<%=pages%>/">&gt;</a></li>\r\n            </ul>\r\n        </div>\r\n        <% } %>\r\n    </div>\r\n</div>\r\n';});

define('modules/library/views/category',[
    'app'
    , 'text!modules/library/templates/category.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('category').prarent.name;
        }
        , cateid: function(){
            return this.model.get('category').prarent.id;
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({
                category: this.model.toJSON()
                , page: this.model.page
                , pages: this.model.pages
                , pagesize: this.model.pagesize
                , cid: this.options.cid
                , current_page: this.options.page
            }));
            return this;
        }
    });
    return View;
});
define('modules/library/models/resource',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/resource/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});
define('modules/library/collections/results',[
    'app'
    , 'modules/library/models/resource'
],function(
    app
    , Resource
    ){
    
    var Collection = Backbone.Collection.extend({
        model: Resource
        , initialize: function(attrs, options){
        }
        , url: app.api + '/search/'
        , parse: function(response){
            this.page = response.page;
            this.pagesize = response.pagesize;
            this.pages = Math.ceil(response.total / response.pagesize);
            response.category && (this.categorys = response.category);
            response.college && (this.colleges = response.college);
            return response.pkg.list;
        }
    });
    return Collection;
});

define('text!modules/library/templates/search.html',[],function () { return '<div id="search">\r\n    <form class="search-form" id="search-form">\r\n        <input type="text" name="keyword" class="form-control" placeholder="搜索视频、音频、PPT、文档等教育资源" value="<%-keyword%>"/>\r\n        <button type="submit" class="btn btn-search"><i class="icon icon-search"></i></button>\r\n        <div class="help-block">找到如下 “<%-keyword%>” 相关内容</div>\r\n    </form>\r\n</div>\r\n<div id="result">\r\n    <div class="container">\r\n        <div class="sidebar">\r\n            <ul class="type-menu">\r\n                <li <%= current_filter[\'type\'] === \'\' ? \'class="active"\':\'\' %>><a href="#" data-filter="type" data-name="">全部</a></li>\r\n                <li <%= current_filter[\'type\'] === 0 ? \'class="active"\':\'\' %>><a href="#" data-filter="type" data-name="0">课程</a></li>\r\n                <li <%= current_filter[\'type\'] === 1 ? \'class="active"\':\'\' %>><a href="#" data-filter="type" data-name="1">视频</a></li>\r\n            </ul>\r\n            <h2>课程筛选</h2>\r\n            <% if(categorys){ %>\r\n            <dl class="filter">\r\n                <dt>按类型</dt>\r\n                <dd>\r\n                    <ul class="filter-list" id="category-filters">\r\n                        <li <%= !current_filter[\'category\'] ? \'class="active"\':\'\' %>><a href="#" data-filter="category" data-name="">全部</a></li>\r\n                        <% _.each(categorys, function(item){%>\r\n\r\n                        <li <%= current_filter[\'category\'] === item.name ? \'class="active"\':\'\' %>><a href="#" data-filter="category" data-name="<%-item.name%>"><%-item.name%></a></li>\r\n                        <% }) %>\r\n                    </ul>\r\n                </dd>\r\n            </dl>\r\n            <% } %>\r\n            <% if(colleges){ %>\r\n            <dl class="filter">\r\n                <dt>按学校</dt>\r\n                <dd>\r\n                    <ul class="filter-list" id="college-filters">\r\n                        <li <%= !current_filter[\'college\'] ? \'class="active"\':\'\' %>><a href="#" data-filter="college" data-name="">全部</a></li>\r\n                        <% _.each(colleges, function(item){%>\r\n                        <li <%= current_filter[\'college\'] === item ? \'class="active"\':\'\' %>><a href="#" data-filter="college" data-name="<%-item%>"><%-item%></a></li>\r\n                        <% }) %>\r\n                    </ul>\r\n                </dd>\r\n            </dl>\r\n            <% } %>\r\n        </div>\r\n        <div class="content">\r\n            <h1>“<%=keyword%>”的搜索结果</h1>\r\n            <% if(result.length){ %>\r\n            <ul class="result-list">\r\n                <% _.each(result, function(res){%>\r\n                <li>\r\n                    <div class="thumb"><a href="#!/resource/<%=res.id%>/"><img src="<%=res.pic%>" alt="<%=res.title%>"/></a></div>\r\n                    <div class="detail">\r\n                        <h3><a href="#!/resource/<%=res.id%>/"><%-res.title%></a></h3>\r\n                        <div class="metas">\r\n                            <div class="meta"><span class="tit">学校：</span><%-res.college%></div>\r\n                            <div class="meta"><span class="tit">讲师：</span><%-res.author%></div>\r\n                            <div class="meta"><span class="tit">类型：</span><%-res.category%></div>\r\n                        </div>\r\n                        <div class="intro"><%-res.desc%></div>\r\n                    </div>\r\n                </li>\r\n                <% }) %>\r\n            </ul>\r\n            <% }else{ %>\r\n            <p>没有找到“<%=keyword%>”相关内容</p>\r\n            <% } %>\r\n            <% if(pages > 1){ %>\r\n            <div class="text-center">\r\n                <ul class="pagination">\r\n                    <li <%= current_page==1?\'class="disabled"\':\'\' %>><a href="#!/search/<%-keyword%>/1/">&lt;</a></li>\r\n                    <% for(var i=1; i<=pages; i++){ %>\r\n                    <li <%= current_page==i?\'class="active"\':\'\' %>><a href="#!/search/<%-keyword%>/<%=i%>/"><%=i%></a></li>\r\n                    <% } %>\r\n                    <li <%= current_page==pages?\'class="disabled"\':\'\' %>><a href="#!/search/<%-keyword%>/<%=pages%>/">&gt;</a></li>\r\n                </ul>\r\n            </div>\r\n            <% } %>\r\n        </div>\r\n    </div>\r\n</div>\r\n';});

// by zhangxixnu 2010-06-21  welcome to visit my personal website http://www.zhangxinxu.com/
// textSearch.js v1.0 文字，关键字的页面纯客户端搜索
// 2010-06-23 修复多字母检索标签破碎的问题
// 2010-06-29 修复页面注释显示的问题
// 2013-05-07 修复继续搜素关键字包含之前搜索关键字没有结果的问题
// 不论何种情况，务必保留作者署名。 


(function($){
	$.fn.textSearch = function(str,options){
		var defaults = {
			divFlag: true,
			divStr: " ",
			markClass: "",
			markColor: "red",
			nullReport: true,
			callback: function(){
				return false;	
			}
		};
		var sets = $.extend({}, defaults, options || {}), clStr;
		if(sets.markClass){
			clStr = "class='"+sets.markClass+"'";	
		}else{
			clStr = "style='color:"+sets.markColor+";'";
		}
		
		//对前一次高亮处理的文字还原		
		$("span[rel='mark']").each(function() {
			var text = document.createTextNode($(this).text());	
			$(this).replaceWith($(text));
		});
		
		
		//字符串正则表达式关键字转化
		$.regTrim = function(s){
			var imp = /[\^\.\\\|\(\)\*\+\-\$\[\]\?]/g;
			var imp_c = {};
			imp_c["^"] = "\\^";
			imp_c["."] = "\\.";
			imp_c["\\"] = "\\\\";
			imp_c["|"] = "\\|";
			imp_c["("] = "\\(";
			imp_c[")"] = "\\)";
			imp_c["*"] = "\\*";
			imp_c["+"] = "\\+";
			imp_c["-"] = "\\-";
			imp_c["$"] = "\$";
			imp_c["["] = "\\[";
			imp_c["]"] = "\\]";
			imp_c["?"] = "\\?";
			s = s.replace(imp,function(o){
				return imp_c[o];					   
			});	
			return s;
		};
		$(this).each(function(){
			var t = $(this);
			str = $.trim(str);
			if(str === ""){
				alert("关键字为空");	
				return false;
			}else{
				//将关键字push到数组之中
				var arr = [];
				if(sets.divFlag){
					arr = str.split(sets.divStr);	
				}else{
					arr.push(str);	
				}
			}
			var v_html = t.html();
			//删除注释
			v_html = v_html.replace(/<!--(?:.*)\-->/g,"");
			
			//将HTML代码支离为HTML片段和文字片段，其中文字片段用于正则替换处理，而HTML片段置之不理
			var tags = /[^<>]+|<(\/?)([A-Za-z]+)([^<>]*)>/g;
			var a = v_html.match(tags), test = 0;
			$.each(a, function(i, c){
				if(!/<(?:.|\s)*?>/.test(c)){//非标签
					//开始执行替换
					$.each(arr,function(index, con){
						if(con === ""){return;}
						var reg = new RegExp($.regTrim(con), "g");
						if(reg.test(c)){
							//正则替换
							c = c.replace(reg,"♂"+con+"♀");
							test = 1;
						}
					});
					c = c.replace(/♂/g,"<span rel='mark' "+clStr+">").replace(/♀/g,"</span>");
					a[i] = c;
				}
			});
			//将支离数组重新组成字符串
			var new_html = a.join("");
			
			$(this).html(new_html);
			
			if(test === 0 && sets.nullReport){
				alert("没有搜索结果");	
				return false;
			}
			
			//执行回调函数
			sets.callback();
		});
	};
})(jQuery);
define("textSearch", function(){});

define('modules/library/views/search',[
    'app'
    , 'text!modules/library/templates/search.html'
    , 'textSearch'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , events: {
            'submit #search-form': 'search',
            'click .type-menu a, .filter-list a': 'filter'
        }
        , current_filter: {
            category: '',
            college: '',
            type: ''
        }
        , initialize: function(options){
            this.options = options || {};
            this.current_filter['keyword'] = this.options.keyword;
            this.listenTo(this.collection, 'sync', this.render);
        }
        , title: function(){
            return '“' + this.options.keyword + '”的搜索结果';
        }
        , render: function(){
            this.$el.html(this.template({
                result:  this.collection.toJSON()
                , categorys: this.collection.categorys
                , colleges: this.collection.colleges
                , current_filter: this.current_filter
                , keyword: this.options.keyword
                , page: this.collection.page
                , pages: this.collection.pages
                , pagesize: this.collection.pagesize
                , cid: this.options.cid
                , current_page: this.options.page
            }));
            this.$('#result .content').textSearch(this.options.keyword);
            return this;
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }
        , filter: function(e){
            e.preventDefault();
            var filter = $(e.currentTarget).data('filter'),
                name = $(e.currentTarget).data('name');
            this.current_filter[filter] = name;
            this.collection.fetch({
                data: this.current_filter
            })
        }
    });
    return View;
});

define('text!modules/library/templates/resource.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li><a href="#!/">课程</a></li>\r\n            <li class="active"><%=resource.title%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="resource">\r\n    <div class="resource-cover">\r\n        <div class="container">\r\n            <div class="cover">\r\n                <div class="thumb">\r\n                    <img src="<%=resource.pic%>" alt="<%=resource.title%>"/>\r\n                </div>\r\n                <h1><%=resource.title%></h1>\r\n                <div class="intro">\r\n                    <p>课程介绍</p>\r\n                    <%=resource.intro%>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class="resource-info">\r\n        <div class="container">\r\n            <div class="author">\r\n                <h3><%- resource.comments.author_title ? resource.comments.author_title : \'讲师介绍\'%></h3>\r\n                <div class="cnt">\r\n                <% _.each(resource.author_list,function(author, index){ %>\r\n                    <div class="item<%=index>0?\' ismore\': \'\'%>">\r\n                        <div class="pic"><img src="<%=author.pic%>" alt="<%=author.name%>"/></div>\r\n                        <div class="name">讲师：<strong><%=author.name%></strong></div>\r\n                        <div class="intro">简介：<%=author.intro%></div>\r\n                    </div>\r\n                <% }) %>\r\n                </div>\r\n            </div>\r\n            <div class="college">\r\n                <h3><%- resource.comments.college_title ? resource.comments.college_title : \'学院介绍\'%></h3>\r\n                <div class="cnt">\r\n                <% _.each(resource.college_list,function(college, index){ %>\r\n                    <div class="item<%=index>0?\' ismore\': \'\'%>">\r\n                        <%=college.intro%>\r\n                    </div>\r\n                <% }) %>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class="resource-list">\r\n        <div class="container">\r\n            <% if(video_list){ %>\r\n                <ul class="thumb-list">\r\n                    <% _.each(video_list, function(res, index){%>\r\n                    <% if(index+1 <= 20){ %>\r\n                    <li>\r\n                        <a href="#!/detail/<%=res.id%>/" class="thumb" target="_blank"><img src="<%=res.img.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                        <a href="#!/detail/<%=res.id%>/" class="intro" target="_blank"><%=res.content.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }); %>\r\n                </ul>\r\n                <% if(video_list.length > 20){ %>\r\n                <ul class="thumb-list resource-more" style="display: none">\r\n                    <% _.each(video_list, function(res, index){ %>\r\n                    <% if(index+1 > 20){ %>\r\n                    <li>\r\n                        <a href="#!/detail/<%=res.id%>/" class="thumb" target="_blank"><img src="<%=res.img.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                        <a href="#!/detail/<%=res.id%>/" class="intro" target="_blank"><%=res.content.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }); %>\r\n                </ul>\r\n                <div class="more-btn"><a href="javascript:void(0)">查看更多 <i class="icon icon-arrow-circle-down"></i></a></div>\r\n                <% } %>\r\n            <% } %>\r\n            <% if(img_list){ %>\r\n                <h2>图片<small>Pictrues</small></h2>\r\n                <ul class="thumb-list">\r\n                    <% _.each(img_list, function(res, index){%>\r\n                    <% if(index+1 <= 20){ %>\r\n                    <li>\r\n                        <a href="#!/detail/<%=res.id%>/" class="thumb" target="_blank"><img src="<%=res.img.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                        <a href="#!/detail/<%=res.id%>/" class="intro" target="_blank"><%=res.content.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }); %>\r\n                </ul>\r\n                <% if(img_list.length > 20){ %>\r\n                <ul class="thumb-list resource-more" style="display: none">\r\n                    <% _.each(img_list, function(res, index){ %>\r\n                    <% if(index+1 > 20){ %>\r\n                    <li>\r\n                        <a href="#!/detail/<%=res.id%>/" class="thumb" target="_blank"><img src="<%=res.img.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                        <a href="#!/detail/<%=res.id%>/" class="intro" target="_blank"><%=res.content.title%></a>\r\n                    </li>\r\n                    <% } %>\r\n                    <% }); %>\r\n                </ul>\r\n                <div class="more-btn"><a href="javascript:void(0)">查看更多 <i class="icon icon-arrow-circle-down"></i></a></div>\r\n                <% } %>\r\n            <% } %>\r\n            <% if(music_list){ %>\r\n                <h2>音频<small>Sounds</small></h2>\r\n                <table class="table table-striped">\r\n                    <colgroup>\r\n                        <col width="40"/>\r\n                        <col width="60"/>\r\n                        <col width="*"/>\r\n                        <col width="80"/>\r\n                    </colgroup>\r\n                    <thead>\r\n                    <tr>\r\n                        <th>#</th>\r\n                        <th>播放</th>\r\n                        <th>标题</th>\r\n                        <th></th>\r\n                    </tr>\r\n                    </thead>\r\n                    <tbody>\r\n                    <% _.each(music_list, function(res, index){%>\r\n                    <tr>\r\n                        <td><%-index + 1%></td>\r\n                        <td><a href="#!/detail/<%=res.id%>/" target="_blank"><i class="icon icon-play-circle-o"></i></a></td>\r\n                        <td><%=res.content.title%></td>\r\n                        <td><a href="<%=res.file.url_path%>" target="_blank">下载</a></td>\r\n                    </tr>\r\n                    <% }); %>\r\n                    </tbody>\r\n                </table>\r\n            <% } %>\r\n            <% if(doc_list){ %>\r\n                <h2>文档<small>Files</small></h2>\r\n                <table class="table table-striped">\r\n                    <colgroup>\r\n                        <col width="40"/>\r\n                        <col width="60"/>\r\n                        <col width="*"/>\r\n                        <col width="80"/>\r\n                    </colgroup>\r\n                    <thead>\r\n                    <tr>\r\n                        <th>#</th>\r\n                        <th>阅读</th>\r\n                        <th>标题</th>\r\n                        <th></th>\r\n                    </tr>\r\n                    </thead>\r\n                    <tbody>\r\n                    <% _.each(doc_list, function(res, index){%>\r\n                    <tr>\r\n                        <td><%-index + 1%></td>\r\n                        <td><a href="#!/detail/<%=res.id%>/" target="_blank"><i class="icon icon-eye"></i></a></td>\r\n                        <td>《<%=res.content.title%>》</td>\r\n                        <td><a href="<%=res.file.url_path%>" target="_blank">下载</a></td>\r\n                    </tr>\r\n                    <% }); %>\r\n                    </tbody>\r\n                </table>\r\n            <% } %>\r\n        </div>\r\n    </div>\r\n</div>\r\n';});

define('modules/library/views/resource',[
    'app'
    , 'text!modules/library/templates/resource.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('resource').title;
        }
        , events: {
          'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});
define('modules/library/models/detail',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/play/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});

define('text!modules/library/templates/detail_video.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li class="active"><%-data_info.content.title%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="player">\r\n    <div class="container">\r\n        <h1><%-data_info.content.title%></h1>\r\n        <div id="video-player" class="video-player">\r\n            <video src="<%-data_info.content.file.url_path%>" controls="controls" autoplay="autoplay"></video>\r\n        </div>\r\n    </div>\r\n</div>\r\n<div id="editor" class="closed">\r\n    <div class="container">\r\n        <div class="video-editor">\r\n            <h3><i class="icon icon-sliders"></i> 视频下载</h3>\r\n            <div class="content">\r\n                <div class="range-slider">\r\n                    <input type="text" id="download-range" />\r\n                </div>\r\n                <div class="buttons">\r\n                    <a href="javascript:;" class="btn btn-primary" id="video-preview-btn" data-url="<%-data_info.content.file.url_path%>">预览</a>\r\n                    <a href="javascript:;" class="btn btn-primary" id="video-save-btn" data-url="<%-data_info.content.file.url_path%>">保存</a>\r\n                </div>\r\n            </div>\r\n            <a href="javascript:;" class="open-control">点击展开</a>\r\n        </div>\r\n        <div class="mobile-panel">\r\n            <div class="qrcode"><img src="./qrcodes/?uri=<%=encodeURIComponent(window.location.href)%>" alt="使用手机扫描二维码"/></div>\r\n            <h3><i class="icon icon-mobile-phone"></i> 手机浏览</h3>\r\n            <p>使用手机扫描左侧二维码浏览</p>\r\n        </div>\r\n    </div>\r\n</div>\r\n<% if(related_data){ %>\r\n<div id="related">\r\n    <div class="container">\r\n            <ul class="thumb-list">\r\n                <% _.each(related_data, function(res, index){%>\r\n                <% if(index+1 <= 20){ %>\r\n                <li>\r\n                    <a href="#!/detail/<%=res.id%>/" class="thumb"><img src="<%=res.content.image.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                    <a href="#!/detail/<%=res.id%>/" class="intro"><%=res.content.title%></a>\r\n                </li>\r\n                <% } %>\r\n                <% }); %>\r\n            </ul>\r\n            <% if(related_data.length > 20){ %>\r\n            <ul class="thumb-list resource-more" style="display: none">\r\n                <% _.each(related_data, function(res, index){ %>\r\n                <% if(index+1 > 20){ %>\r\n                <li>\r\n                    <a href="#!/detail/<%=res.id%>/" class="thumb"><img src="<%=res.content.image.url_path%>" alt="<%=res.content.title%>"/></a>\r\n                    <a href="#!/detail/<%=res.id%>/" class="intro"><%=res.content.title%></a>\r\n                </li>\r\n                <% } %>\r\n                <% }); %>\r\n            </ul>\r\n            <div class="more-btn"><a href="javascript:void(0)">查看更多 <i class="icon icon-arrow-circle-down"></i></a></div>\r\n            <% } %>\r\n    </div>\r\n</div>\r\n<% } %>\r\n<div class="modal fade" id="preview">\r\n    <div class="modal-dialog">\r\n        <div class="modal-content">\r\n            <div class="modal-header">\r\n                <button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span><span class="sr-only">关闭</span></button>\r\n                <h4 class="modal-title">视频预览</h4>\r\n            </div>\r\n            <div class="modal-body" id="preview-player"></div>\r\n        </div>\r\n    </div>\r\n</div>';});

// Ion.RangeSlider
// version 1.9.3 Build: 176
// © 2013-2014 Denis Ineshin | IonDen.com
//
// Project page:    http://ionden.com/a/plugins/ion.rangeSlider/
// GitHub page:     https://github.com/IonDen/ion.rangeSlider
//
// Released under MIT licence:
// http://ionden.com/a/plugins/licence-en.html
// =====================================================================================================================

(function ($, document, window, navigator) {
    

    var plugin_count = 0,
        current;

    var is_old_ie = (function () {
        var n = navigator.userAgent,
            r = /msie\s\d+/i,
            v;
        if (n.search(r) > 0) {
            v = r.exec(n).toString();
            v = v.split(" ")[1];
            if (v < 9) {
                return true;
            }
        }
        return false;
    }());
    var is_touch = (('ontouchstart' in window) || (navigator.msMaxTouchPoints > 0));

    var testNumber = function (num) {
        if (typeof num === "number") {
            if (isNaN(num)) {
                return null;
            } else {
                return num;
            }
        } else {
            num = parseFloat(num);
            if (isNaN(num)) {
                return null;
            } else {
                return num;
            }
        }
    };

    var methods = {
        init: function (options) {

            // irs = ion range slider css prefix
            var baseHTML =
                '<span class="irs">' +
                '<span class="irs-line"><span class="irs-line-left"></span><span class="irs-line-mid"></span><span class="irs-line-right"></span></span>' +
                '<span class="irs-min">0</span><span class="irs-max">1</span>' +
                '<span class="irs-from">0</span><span class="irs-to">0</span><span class="irs-single">0</span>' +
                '</span>' +
                '<span class="irs-grid"></span>';

            var singleHTML =
                '<span class="irs-slider single"></span>';

            var doubleHTML =
                '<span class="irs-diapason"></span>' +
                '<span class="irs-slider from"></span>' +
                '<span class="irs-slider to"></span>';

            var disableHTML =
                '<span class="irs-disable-mask"></span>';



            return this.each(function () {
                var settings = $.extend({
                    min: null,
                    max: null,
                    from: null,
                    to: null,
                    type: "single",
                    step: null,
                    prefix: "",
                    postfix: "",
                    maxPostfix: "",
                    hasGrid: false,
                    gridMargin: 0,
                    hideMinMax: false,
                    hideFromTo: false,
                    prettify: true,
                    disable: false,
                    values: null,
                    onLoad: null,
                    onChange: null,
                    onFinish: null
                }, options);



                var slider = $(this),
                    self = this,
                    allow_values = false,
                    value_array = null;

                if (slider.data("isActive")) {
                    return;
                }
                slider.data("isActive", true);

                plugin_count += 1;
                this.plugin_count = plugin_count;



                // check default values
                if (slider.prop("value")) {
                    value_array = slider.prop("value").split(";");
                }

                if (settings.type === "single") {

                    if (value_array && value_array.length > 1) {

                        if (typeof settings.min !== "number") {
                            settings.min = parseFloat(value_array[0]);
                        } else {
                            if (typeof settings.from !== "number") {
                                settings.from = parseFloat(value_array[0]);
                            }
                        }

                        if (typeof settings.max !== "number") {
                            settings.max = parseFloat(value_array[1]);
                        }

                    } else if (value_array && value_array.length === 1) {

                        if (typeof settings.from !== "number") {
                            settings.from = parseFloat(value_array[0]);
                        }

                    }

                } else if (settings.type === "double") {

                    if (value_array && value_array.length > 1) {

                        if (typeof settings.min !== "number") {
                            settings.min = parseFloat(value_array[0]);
                        } else {
                            if (typeof settings.from !== "number") {
                                settings.from = parseFloat(value_array[0]);
                            }
                        }

                        if (typeof settings.max !== "number") {
                            settings.max = parseFloat(value_array[1]);
                        } else {
                            if (typeof settings.to !== "number") {
                                settings.to = parseFloat(value_array[1]);
                            }
                        }

                    } else if (value_array && value_array.length === 1) {

                        if (typeof settings.min !== "number") {
                            settings.min = parseFloat(value_array[0]);
                        } else {
                            if (typeof settings.from !== "number") {
                                settings.from = parseFloat(value_array[0]);
                            }
                        }

                    }

                }



                // extend from data-*
                if (typeof slider.data("min") === "number") {
                    settings.min = parseFloat(slider.data("min"));
                }
                if (typeof slider.data("max") === "number") {
                    settings.max = parseFloat(slider.data("max"));
                }
                if (typeof slider.data("from") === "number") {
                    settings.from = parseFloat(slider.data("from"));
                }
                if (typeof slider.data("to") === "number") {
                    settings.to = parseFloat(slider.data("to"));
                }
                if (slider.data("step")) {
                    settings.step = parseFloat(slider.data("step"));
                }
                if (slider.data("type")) {
                    settings.type = slider.data("type");
                }
                if (slider.data("prefix")) {
                    settings.prefix = slider.data("prefix");
                }
                if (slider.data("postfix")) {
                    settings.postfix = slider.data("postfix");
                }
                if (slider.data("maxpostfix")) {
                    settings.maxPostfix = slider.data("maxpostfix");
                }
                if (slider.data("hasgrid")) {
                    settings.hasGrid = slider.data("hasgrid");
                }
                if (slider.data("gridmargin")) {
                    settings.gridMargin = +slider.data("gridmargin");
                }
                if (slider.data("hideminmax")) {
                    settings.hideMinMax = slider.data("hideminmax");
                }
                if (slider.data("hidefromto")) {
                    settings.hideFromTo = slider.data("hidefromto");
                }
                if (slider.data("prettify")) {
                    settings.prettify = slider.data("prettify");
                }
                if (slider.data("disable")) {
                    settings.disable = slider.data("disable");
                }
                if (slider.data("values")) {
                    settings.values = slider.data("values").split(",");
                }



                // Set Min and Max if no
                settings.min = testNumber(settings.min);
                if (!settings.min && settings.min !== 0) {
                    settings.min = 10;
                }

                settings.max = testNumber(settings.max);
                if (!settings.max && settings.max !== 0) {
                    settings.max = 100;
                }



                // Set values
                if (Object.prototype.toString.call(settings.values) !== "[object Array]") {
                    settings.values = null;
                }
                if (settings.values && settings.values.length > 0) {
                    settings.min = 0;
                    settings.max = settings.values.length - 1;
                    settings.step = 1;
                    allow_values = true;
                }



                // Set From and To if no
                settings.from = testNumber(settings.from);
                if (!settings.from && settings.from !== 0) {
                    settings.from = settings.min;
                }

                settings.to = testNumber(settings.to);
                if (!settings.to && settings.to !== 0) {
                    settings.to = settings.max;
                }


                // Set step
                settings.step = testNumber(settings.step);
                if (!settings.step) {
                    settings.step = 1;
                }



                // fix diapason
                if (settings.from < settings.min) {
                    settings.from = settings.min;
                }
                if (settings.from > settings.max) {
                    settings.from = settings.min;
                }

                if (settings.to < settings.min) {
                    settings.to = settings.max;
                }
                if (settings.to > settings.max) {
                    settings.to = settings.max;
                }

                if (settings.type === "double") {
                    if (settings.from > settings.to) {
                        settings.from = settings.to;
                    }
                    if (settings.to < settings.from) {
                        settings.to = settings.from;
                    }
                }


                var prettify = function (num) {
                    var n = num.toString();
                    var m = Math.floor(num / 60);
                    var s = num % 60;
                    if (settings.prettify) {
                        n = m + '分' + s + '秒';
//                        n = n.replace(/(\d{1,3}(?=(?:\d\d\d)+(?!\d)))/g, "$1 ");
                    }
                    return n;
                };


                var containerHTML = '<span class="irs" id="irs-' + this.plugin_count + '"></span>';
                slider[0].style.display = "none";
                slider.before(containerHTML);

                var $container = slider.prev(),
                    $body = $(document.body),
                    $window = $(window),
                    $rangeSlider,
                    $fieldMin,
                    $fieldMax,
                    $fieldFrom,
                    $fieldTo,
                    $fieldSingle,
                    $singleSlider,
                    $fromSlider,
                    $toSlider,
                    $activeSlider,
                    $diapason,
                    $grid;

                var allowDrag = false,
                    is_slider_active = false,
                    is_first_start = true,
                    numbers = {};

                var mouseX = 0,
                    fieldMinWidth = 0,
                    fieldMaxWidth = 0,
                    normalWidth = 0,
                    fullWidth = 0,
                    sliderWidth = 0,
                    width = 0,
                    left = 0,
                    right = 0,
                    minusX = 0,
                    stepFloat = 0;


                if (parseInt(settings.step, 10) !== parseFloat(settings.step)) {
                    stepFloat = settings.step.toString().split(".")[1];
                    stepFloat = Math.pow(10, stepFloat.length);
                }



                // public methods
                this.updateData = function (options) {
                    $.extend(settings, options);
                    removeHTML();
                };
                this.removeSlider = function () {
                    $container.find("*").off();
                    $window.off("mouseup.irs" + self.plugin_count);
                    $body.off("mouseup.irs" + self.plugin_count);
                    $body.off("mouseleave.irs" + self.plugin_count);
                    $body.off("mousemove.irs" + self.plugin_count);
                    $container.html("").remove();
                    slider.data("isActive", false);
                    slider.show();
                };





                // private methods
                var removeHTML = function () {
                    $container.find("*").off();
                    $window.off("mouseup.irs" + self.plugin_count);
                    $body.off("mouseup.irs" + self.plugin_count);
                    $body.off("mouseleave.irs" + self.plugin_count);
                    $body.off("mousemove.irs" + self.plugin_count);
                    $container.html("");

                    placeHTML();
                };
                var placeHTML = function () {
                    $container.html(baseHTML);
                    $rangeSlider = $container.find(".irs");

                    $fieldMin = $rangeSlider.find(".irs-min");
                    $fieldMax = $rangeSlider.find(".irs-max");
                    $fieldFrom = $rangeSlider.find(".irs-from");
                    $fieldTo = $rangeSlider.find(".irs-to");
                    $fieldSingle = $rangeSlider.find(".irs-single");
                    $grid = $container.find(".irs-grid");

                    if (settings.hideFromTo) {
                        $fieldFrom[0].style.visibility = "hidden";
                        $fieldTo[0].style.visibility = "hidden";
                        $fieldSingle[0].style.visibility = "hidden";
                    }
                    if (!settings.hideFromTo) {
                        $fieldFrom[0].style.visibility = "visible";
                        $fieldTo[0].style.visibility = "visible";
                        $fieldSingle[0].style.visibility = "visible";
                    }

                    if (settings.hideMinMax) {
                        $fieldMin[0].style.visibility = "hidden";
                        $fieldMax[0].style.visibility = "hidden";

                        fieldMinWidth = 0;
                        fieldMaxWidth = 0;
                    }
                    if (!settings.hideMinMax) {
                        $fieldMin[0].style.visibility = "visible";
                        $fieldMax[0].style.visibility = "visible";

                        if (settings.values) {
                            $fieldMin.html(settings.prefix + settings.values[0] + settings.postfix);
                            $fieldMax.html(settings.prefix + settings.values[settings.values.length - 1] + settings.maxPostfix + settings.postfix);
                        } else {
                            $fieldMin.html(settings.prefix + prettify(settings.min) + settings.postfix);
                            $fieldMax.html(settings.prefix + prettify(settings.max) + settings.maxPostfix + settings.postfix);
                        }

                        fieldMinWidth = $fieldMin.outerWidth(false);
                        fieldMaxWidth = $fieldMax.outerWidth(false);
                    }

                    bindEvents();
                };

                var bindEvents = function () {
                    if (settings.type === "single") {
                        $rangeSlider.append(singleHTML);

                        $singleSlider = $rangeSlider.find(".single");

                        $singleSlider.on("mousedown", function (e) {
                            e.preventDefault();
                            e.stopPropagation();

                            calcDimensions(e, $(this), null);

                            allowDrag = true;
                            is_slider_active = true;
                            current = self.plugin_count;

                            if (is_old_ie) {
                                $("*").prop("unselectable", true);
                            }
                        });
                        if (is_touch) {
                            $singleSlider.on("touchstart", function (e) {
                                e.preventDefault();
                                e.stopPropagation();

                                calcDimensions(e.originalEvent.touches[0], $(this), null);

                                allowDrag = true;
                                is_slider_active = true;
                                current = self.plugin_count;
                            });
                        }

                    } else if (settings.type === "double") {
                        $rangeSlider.append(doubleHTML);

                        $fromSlider = $rangeSlider.find(".from");
                        $toSlider = $rangeSlider.find(".to");
                        $diapason = $rangeSlider.find(".irs-diapason");

                        setDiapason();

                        $fromSlider.on("mousedown", function (e) {
                            e.preventDefault();
                            e.stopPropagation();

                            $(this).addClass("last");
                            $toSlider.removeClass("last");
                            calcDimensions(e, $(this), "from");

                            allowDrag = true;
                            is_slider_active = true;
                            current = self.plugin_count;

                            if (is_old_ie) {
                                $("*").prop("unselectable", true);
                            }
                        });
                        $toSlider.on("mousedown", function (e) {
                            e.preventDefault();
                            e.stopPropagation();

                            $(this).addClass("last");
                            $fromSlider.removeClass("last");
                            calcDimensions(e, $(this), "to");

                            allowDrag = true;
                            is_slider_active = true;
                            current = self.plugin_count;

                            if (is_old_ie) {
                                $("*").prop("unselectable", true);
                            }
                        });

                        if (is_touch) {
                            $fromSlider.on("touchstart", function (e) {
                                e.preventDefault();
                                e.stopPropagation();

                                $(this).addClass("last");
                                $toSlider.removeClass("last");
                                calcDimensions(e.originalEvent.touches[0], $(this), "from");

                                allowDrag = true;
                                is_slider_active = true;
                                current = self.plugin_count;
                            });
                            $toSlider.on("touchstart", function (e) {
                                e.preventDefault();
                                e.stopPropagation();

                                $(this).addClass("last");
                                $fromSlider.removeClass("last");
                                calcDimensions(e.originalEvent.touches[0], $(this), "to");

                                allowDrag = true;
                                is_slider_active = true;
                                current = self.plugin_count;
                            });
                        }

                        if (settings.to === settings.max) {
                            $fromSlider.addClass("last");
                        }
                    }

                    var mouseup = function () {
                        if (current !== self.plugin_count) {
                            return;
                        }

                        if (allowDrag) {
                            is_slider_active = false;
                            allowDrag = false;
                            $activeSlider.removeAttr("id");
                            $activeSlider = null;
                            if (settings.type === "double") {
                                setDiapason();
                            }
                            getNumbers();

                            if (is_old_ie) {
                                $("*").prop("unselectable", false);
                            }
                        }
                    };

                    $window.on("mouseup.irs" + self.plugin_count, function () {
                        mouseup();
                    });

                    if (is_old_ie) {
                        $body.on("mouseleave.irs" + self.plugin_count, function () {
                            mouseup();
                        });
                    }


                    $body.on("mousemove.irs" + self.plugin_count, function (e) {
                        if (allowDrag) {
                            mouseX = e.pageX;
                            dragSlider();
                        }
                    });

                    $container.on("mousedown", function () {
                        current = self.plugin_count;
                    });

                    $container.on("mouseup", function (e) {
                        if (current !== self.plugin_count) {
                            return;
                        }

                        if (allowDrag || settings.disable) {
                            return;
                        }

                        moveByClick(e.pageX);
                    });

                    if (is_touch) {
                        $window.on("touchend", function () {
                            if (allowDrag) {
                                is_slider_active = false;
                                allowDrag = false;
                                $activeSlider.removeAttr("id");
                                $activeSlider = null;
                                if (settings.type === "double") {
                                    setDiapason();
                                }
                                getNumbers();
                            }
                        });
                        $window.on("touchmove", function (e) {
                            if (allowDrag) {
                                mouseX = e.originalEvent.touches[0].pageX;
                                dragSlider();
                            }
                        });
                    }

                    getSize();
                    setNumbers();
                    if (settings.hasGrid) {
                        setGrid();
                    }
                    if (settings.disable) {
                        setMask();
                    } else {
                        removeMask();
                    }
                };

                var getSize = function () {
                    normalWidth = $rangeSlider.width();
                    if ($singleSlider) {
                        sliderWidth = $singleSlider.width();
                    } else {
                        sliderWidth = $fromSlider.width();
                    }
                    fullWidth = normalWidth - sliderWidth;
                };

                var calcDimensions = function (e, currentSlider, whichSlider) {
                    getSize();

                    is_first_start = false;
                    $activeSlider = currentSlider;
                    $activeSlider.prop("id", "irs-active-slider");

                    var _x1 = $activeSlider.offset().left,
                        _x2 = e.pageX - _x1;
                    minusX = _x1 + _x2 - $activeSlider.position().left;

                    if (settings.type === "single") {

                        width = $rangeSlider.width() - sliderWidth;

                    } else if (settings.type === "double") {

                        if (whichSlider === "from") {
                            left = 0;
                            right = parseInt($toSlider.css("left"), 10);
                        } else {
                            left = parseInt($fromSlider.css("left"), 10);
                            right = $rangeSlider.width() - sliderWidth;
                        }

                    }
                };

                var setDiapason = function () {
                    var _w = $fromSlider.width(),
                        _x = $.data($fromSlider[0], "x") || parseInt($fromSlider[0].style.left, 10) || $fromSlider.position().left,
                        _width = $.data($toSlider[0], "x") || parseInt($toSlider[0].style.left, 10) || $toSlider.position().left,
                        x = _x + (_w / 2),
                        w = _width - _x;
                    $diapason[0].style.left = x + "px";
                    if($diapason[0].style.width){
                        $diapason[0].style.width = w + "px";
                    }
                };

                var dragSlider = function (manual_x) {
                    var x_pure = mouseX - minusX,
                        x;

                    if (manual_x) {
                        x_pure = manual_x;
                    } else {
                        x_pure = mouseX - minusX;
                    }

                    if (settings.type === "single") {

                        if (x_pure < 0) {
                            x_pure = 0;
                        }
                        if (x_pure > width) {
                            x_pure = width;
                        }

                    } else if (settings.type === "double") {

                        if (x_pure < left) {
                            x_pure = left;
                        }
                        if (x_pure > right) {
                            x_pure = right;
                        }
                        setDiapason();

                    }

                    $.data($activeSlider[0], "x", x_pure);
                    getNumbers();

                    x = Math.round(x_pure);
                    $activeSlider[0].style.left = x + "px";
                };

                var getNumbers = function () {
                    var nums = {
                        input: slider,
                        slider: $container,
                        min: settings.min,
                        max: settings.max,
                        fromNumber: 0,
                        toNumber: 0,
                        fromPers: 0,
                        toPers: 0,
                        fromX: 0,
                        fromX_pure: 0,
                        toX: 0,
                        toX_pure: 0
                    };
                    var diapason = settings.max - settings.min, _from, _to;

                    if (settings.type === "single") {

                        nums.fromX = $.data($singleSlider[0], "x") || parseInt($singleSlider[0].style.left, 10) || $singleSlider.position().left;
                        nums.fromPers = nums.fromX / fullWidth * 100;
                        _from = (diapason / 100 * nums.fromPers) + settings.min;
                        nums.fromNumber = Math.round(_from / settings.step) * settings.step;
                        if (nums.fromNumber < settings.min) {
                            nums.fromNumber = settings.min;
                        }
                        if (nums.fromNumber > settings.max) {
                            nums.fromNumber = settings.max;
                        }

                        if (stepFloat) {
                            nums.fromNumber = parseInt(nums.fromNumber * stepFloat, 10) / stepFloat;
                        }

                        if (allow_values) {
                            nums.fromValue = settings.values[nums.fromNumber];
                        }

                    } else if (settings.type === "double") {

                        nums.fromX = $.data($fromSlider[0], "x") || parseInt($fromSlider[0].style.left, 10) || $fromSlider.position().left;
                        nums.fromPers = nums.fromX / fullWidth * 100;
                        _from = (diapason / 100 * nums.fromPers) + settings.min;
                        nums.fromNumber = Math.round(_from / settings.step) * settings.step;
                        if (nums.fromNumber < settings.min) {
                            nums.fromNumber = settings.min;
                        }

                        nums.toX = $.data($toSlider[0], "x") || parseInt($toSlider[0].style.left, 10) || $toSlider.position().left;
                        nums.toPers = nums.toX / fullWidth * 100;
                        _to = (diapason / 100 * nums.toPers) + settings.min;
                        nums.toNumber = Math.round(_to / settings.step) * settings.step;
                        if (nums.toNumber > settings.max) {
                            nums.toNumber = settings.max;
                        }

                        if (stepFloat) {
                            nums.fromNumber = parseInt(nums.fromNumber * stepFloat, 10) / stepFloat;
                            nums.toNumber = parseInt(nums.toNumber * stepFloat, 10) / stepFloat;
                        }

                        if (allow_values) {
                            nums.fromValue = settings.values[nums.fromNumber];
                            nums.toValue = settings.values[nums.toNumber];
                        }

                    }

                    numbers = nums;
                    setFields();
                };

                var setNumbers = function () {
                    var nums = {
                        input: slider,
                        slider: $container,
                        min: settings.min,
                        max: settings.max,
                        fromNumber: settings.from,
                        toNumber: settings.to,
                        fromPers: 0,
                        toPers: 0,
                        fromX: 0,
                        fromX_pure: 0,
                        toX: 0,
                        toX_pure: 0
                    };
                    var diapason = settings.max - settings.min;

                    if (settings.type === "single") {

                        nums.fromPers = (diapason !== 0) ? (nums.fromNumber - settings.min) / diapason * 100 : 0;
                        nums.fromX_pure = fullWidth / 100 * nums.fromPers;
                        nums.fromX = Math.round(nums.fromX_pure);
                        $singleSlider[0].style.left = nums.fromX + "px";
                        $.data($singleSlider[0], "x", nums.fromX_pure);

                    } else if (settings.type === "double") {

                        nums.fromPers = (diapason !== 0) ? (nums.fromNumber - settings.min) / diapason * 100 : 0;
                        nums.fromX_pure = fullWidth / 100 * nums.fromPers;
                        nums.fromX = Math.round(nums.fromX_pure);
                        $fromSlider[0].style.left = nums.fromX + "px";
                        $.data($fromSlider[0], "x", nums.fromX_pure);

                        nums.toPers = (diapason !== 0) ? (nums.toNumber - settings.min) / diapason * 100 : 1;
                        nums.toX_pure = fullWidth / 100 * nums.toPers;
                        nums.toX = Math.round(nums.toX_pure);
                        $toSlider[0].style.left = nums.toX + "px";
                        $.data($toSlider[0], "x", nums.toX_pure);

                        setDiapason();

                    }

                    numbers = nums;
                    setFields();
                };

                var moveByClick = function (page_x) {
                    is_first_start = false;

                    var x = page_x - $container.offset().left,
                        d = numbers.toX - numbers.fromX,
                        zero_point = numbers.fromX + (d / 2);

                    left = 0;
                    width = $rangeSlider.width() - sliderWidth;
                    right = $rangeSlider.width() - sliderWidth;

                    if (settings.type === "single") {
                        $activeSlider = $singleSlider;
                        $activeSlider.prop("id", "irs-active-slider");
                        dragSlider(x);
                    } else if (settings.type === "double") {
                        if (x <= zero_point) {
                            $activeSlider = $fromSlider;
                        } else {
                            $activeSlider = $toSlider;
                        }
                        $activeSlider.prop("id", "irs-active-slider");
                        dragSlider(x);
                        setDiapason();
                    }

                    $activeSlider.removeAttr("id");
                    $activeSlider = null;
                };

                var setFields = function () {
                    var _from, _fromW, _fromX,
                        _to, _toW, _toX,
                        _single, _singleW, _singleX,
                        _slW = (sliderWidth / 2),
                        maxPostfix = "";

                    if (settings.type === "single") {

                        if (numbers.fromNumber === settings.max) {
                            maxPostfix = settings.maxPostfix;
                        } else {
                            maxPostfix = "";
                        }

                        $fieldFrom[0].style.display = "none";
                        $fieldTo[0].style.display = "none";

                        if (allow_values) {
                            _single =
                                settings.prefix +
                                settings.values[numbers.fromNumber] +
                                maxPostfix +
                                settings.postfix;
                        } else {
                            _single =
                                settings.prefix +
                                prettify(numbers.fromNumber) +
                                maxPostfix +
                                settings.postfix;
                        }

                        $fieldSingle.html(_single);

                        _singleW = $fieldSingle.outerWidth(false);
                        _singleX = numbers.fromX - (_singleW / 2) + _slW;
                        if (_singleX < 0) {
                            _singleX = 0;
                        }
                        if (_singleX > normalWidth - _singleW) {
                            _singleX = normalWidth - _singleW;
                        }
                        $fieldSingle[0].style.left = _singleX + "px";

                        if (!settings.hideMinMax && !settings.hideFromTo) {
                            if (_singleX < fieldMinWidth) {
                                $fieldMin[0].style.display = "none";
                            } else {
                                $fieldMin[0].style.display = "block";
                            }

                            if (_singleX + _singleW > normalWidth - fieldMaxWidth) {
                                $fieldMax[0].style.display = "none";
                            } else {
                                $fieldMax[0].style.display = "block";
                            }
                        }

                        slider.prop("value", parseFloat(numbers.fromNumber));

                    } else if (settings.type === "double") {

                        if (numbers.fromNumber === settings.max) {
                            maxPostfix = settings.maxPostfix;
                        } else {
                            maxPostfix = "";
                        }

                        if (numbers.toNumber === settings.max) {
                            maxPostfix = settings.maxPostfix;
                        } else {
                            maxPostfix = "";
                        }

                        if (allow_values) {
                            _from =
                                settings.prefix +
                                settings.values[numbers.fromNumber] +
                                settings.postfix;

                            _to =
                                settings.prefix +
                                settings.values[numbers.toNumber] +
                                maxPostfix +
                                settings.postfix;

                            if (numbers.fromNumber !== numbers.toNumber) {
                                _single =
                                    settings.prefix +
                                    settings.values[numbers.fromNumber] +
                                    " — " + settings.prefix +
                                    settings.values[numbers.toNumber] +
                                    maxPostfix +
                                    settings.postfix;
                            } else {
                                _single =
                                    settings.prefix +
                                    settings.values[numbers.fromNumber] +
                                    maxPostfix +
                                    settings.postfix;
                            }
                        } else {
                            _from =
                                settings.prefix +
                                prettify(numbers.fromNumber) +
                                settings.postfix;

                            _to =
                                settings.prefix +
                                prettify(numbers.toNumber) +
                                maxPostfix +
                                settings.postfix;

                            if (numbers.fromNumber !== numbers.toNumber) {
                                _single =
                                    settings.prefix +
                                    prettify(numbers.fromNumber) +
                                    " — " + settings.prefix +
                                    prettify(numbers.toNumber) +
                                    maxPostfix +
                                    settings.postfix;
                            } else {
                                _single =
                                    settings.prefix +
                                    prettify(numbers.fromNumber) +
                                    maxPostfix +
                                    settings.postfix;
                            }
                        }

                        $fieldFrom.html(_from);
                        $fieldTo.html(_to);
                        $fieldSingle.html(_single);

                        _fromW = $fieldFrom.outerWidth(false);
                        _fromX = numbers.fromX - (_fromW / 2) + _slW;
                        if (_fromX < 0) {
                            _fromX = 0;
                        }
                        if (_fromX > normalWidth - _fromW) {
                            _fromX = normalWidth - _fromW;
                        }
                        $fieldFrom[0].style.left = _fromX + "px";

                        _toW = $fieldTo.outerWidth(false);
                        _toX = numbers.toX - (_toW / 2) + _slW;
                        if (_toX < 0) {
                            _toX = 0;
                        }
                        if (_toX > normalWidth - _toW) {
                            _toX = normalWidth - _toW;
                        }
                        $fieldTo[0].style.left = _toX + "px";

                        _singleW = $fieldSingle.outerWidth(false);
                        _singleX = numbers.fromX + ((numbers.toX - numbers.fromX) / 2) - (_singleW / 2) + _slW;
                        if (_singleX < 0) {
                            _singleX = 0;
                        }
                        if (_singleX > normalWidth - _singleW) {
                            _singleX = normalWidth - _singleW;
                        }
                        $fieldSingle[0].style.left = _singleX + "px";

                        if (_fromX + _fromW < _toX) {
                            $fieldSingle[0].style.display = "none";
                            $fieldFrom[0].style.display = "block";
                            $fieldTo[0].style.display = "block";
                        } else {
                            $fieldSingle[0].style.display = "block";
                            $fieldFrom[0].style.display = "none";
                            $fieldTo[0].style.display = "none";
                        }

                        if (!settings.hideMinMax && !settings.hideFromTo) {
                            if (_singleX < fieldMinWidth || _fromX < fieldMinWidth) {
                                $fieldMin[0].style.display = "none";
                            } else {
                                $fieldMin[0].style.display = "block";
                            }

                            if (_singleX + _singleW > normalWidth - fieldMaxWidth || _toX + _toW > normalWidth - fieldMaxWidth) {
                                $fieldMax[0].style.display = "none";
                            } else {
                                $fieldMax[0].style.display = "block";
                            }
                        }

                        slider.prop("value", parseFloat(numbers.fromNumber) + ";" + parseFloat(numbers.toNumber));

                    }

                    settings.from = numbers.fromNumber;
                    settings.to = numbers.toNumber;
                    callbacks();
                };


                var callbacks = function () {
                    // trigger onFinish function
                    if (typeof settings.onFinish === "function" && !is_slider_active && !is_first_start) {
                        settings.onFinish.call(this, numbers);
                    }

                    // trigger onChange function
                    if (typeof settings.onChange === "function" && !is_first_start) {
                        settings.onChange.call(this, numbers);
                    }

                    // trigger onLoad function
                    if (typeof settings.onLoad === "function" && !is_slider_active && is_first_start) {
                        settings.onLoad.call(this, numbers);
                        is_first_start = false;
                    }
                };


                var setGrid = function () {
                    $container.addClass("irs-with-grid");

                    var i,
                        text = '',
                        step = 0,
                        tStep = 0,
                        gridHTML = '',
                        smNum = 20,
                        bigNum = 4,
                        cont_width = normalWidth - (settings.gridMargin * 2);



                    for (i = 0; i <= smNum; i += 1) {
                        step = Math.floor(cont_width / smNum * i);

                        if (step >= cont_width) {
                            step = cont_width - 1;
                        }
                        gridHTML += '<span class="irs-grid-pol small" style="left: ' + step + 'px;"></span>';
                    }
                    for (i = 0; i <= bigNum; i += 1) {
                        step = Math.floor(cont_width / bigNum * i);

                        if (step >= cont_width) {
                            step = cont_width - 1;
                        }
                        gridHTML += '<span class="irs-grid-pol" style="left: ' + step + 'px;"></span>';

                        if (stepFloat) {
                            text = (settings.min + ((settings.max - settings.min) / bigNum * i));
                            text = (text / settings.step) * settings.step;
                            text = parseInt(text * stepFloat, 10) / stepFloat;
                        } else {
                            text = Math.round(settings.min + ((settings.max - settings.min) / bigNum * i));
                            text = Math.round(text / settings.step) * settings.step;
                            text = prettify(text);
                        }

                        if (allow_values) {
                            if (settings.hideMinMax) {
                                text = Math.round(settings.min + ((settings.max - settings.min) / bigNum * i));
                                text = Math.round(text / settings.step) * settings.step;
                                if (i === 0 || i === bigNum) {
                                    text = settings.values[text];
                                } else {
                                    text = "";
                                }
                            } else {
                                text = "";
                            }
                        }

                        if (i === 0) {
                            tStep = step;
                            gridHTML += '<span class="irs-grid-text" style="left: ' + tStep + 'px; text-align: left;">' + text + '</span>';
                        } else if (i === bigNum) {
                            tStep = step - 100;
                            gridHTML += '<span class="irs-grid-text" style="left: ' + tStep + 'px; text-align: right;">' + text + '</span>';
                        } else {
                            tStep = step - 50;
                            gridHTML += '<span class="irs-grid-text" style="left: ' + tStep + 'px;">' + text + '</span>';
                        }
                    }

                    $grid.html(gridHTML);
                    $grid[0].style.left = settings.gridMargin + "px";
                };



                // Disable state
                var setMask = function () {
                    $container.addClass("irs-disabled");
                    $container.append(disableHTML);
                };

                var removeMask = function () {
                    $container.removeClass("irs-disabled");
                    $container.find(".irs-disable-mask").remove();
                };



                placeHTML();
            });
        },
        update: function (options) {
            return this.each(function () {
                this.updateData(options);
            });
        },
        remove: function () {
            return this.each(function () {
                this.removeSlider();
            });
        }
    };

    $.fn.ionRangeSlider = function (method) {
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || !method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error('Method ' + method + ' does not exist for jQuery.ionRangeSlider');
        }
    };

}(jQuery, document, window, navigator));
define("ionRangeSlider", ["jquery"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.$.fn.ionRangeSlider;
    };
}(this)));

define('modules/library/views/detail_video',[
    'app'
    , 'text!modules/library/templates/detail_video.html'
    , 'jwplayer'
    , 'ionRangeSlider'
],function(
    app
    , template
){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore',
            'click .open-control': 'toggleEditor',
            'click #video-preview-btn': 'preview',
            'click #video-save-btn': 'save'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            var _this = this;
            this.$el.html(this.template(this.model.toJSON()));
            this.$('#download-range').ionRangeSlider({
                min: 0,
                max: 3600,
                type: 'double',
                prefix: '',
                step: 10,
                from: 0,
                to: 300,
                onLoad: function(obj) {
                    $('#video-preview-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                    $('#video-save-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                },
                onFinish: function(obj) {
                    $('#video-preview-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                    $('#video-save-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                }
            });
            var playlist = [{
                image: this.model.get('data_info').content.image.url_path
                , file:  this.model.get('data_info').content.file.url_path
                , title: this.model.get('data_info').content.title
                , type: this.model.get('data_info').content.file.type

            }];
            _.each(this.model.get('related_data'),function(play){
                playlist.push({
                    image: play.content.image.url_path,
                    file: play.content.file.url_path,
                    title: play.content.title
                });
            });
            this.player = jwplayer('video-player').setup({
                    base: 'assets/player/'
                    , height: function(){
                        var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                        if(width > 767){
                            return 560;
                        }else{
                            return 240;
                        }
                    }()
                    , width: '100%'
                    , autostart: true
                    , startparam: 'start'
                    , primary: 'flash'
                    //, listbar: function(){
                    //    var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                    //    if(width > 767){
                    //        return {
                    //            position: 'right',
                    //            layout: 'extended',
                    //            size: '25%'
                    //        };
                    //    }else{
                    //        return {
                    //            position: 'bottom',
                    //            layout: 'basic',
                    //            size: '25%'
                    //        };
                    //    }
                    //}()
                    , playlist: playlist
                })
                //.onPlay(function(){
                //    _this.$('#download-range').ionRangeSlider('update', {
                //        max: Math.floor(this.getDuration()),
                //        to: Math.floor(this.getDuration() / 4)
                //    });
                //})
                .onPlaylistItem(function(){
                    _this.$('#player h1').text(this.getPlaylistItem().title);
                    _this.$('#video-preview-btn').data('url', this.getPlaylistItem().file);
                    _this.$('#video-save-btn').data('url', this.getPlaylistItem().file);
                    _this.$('#video-full-btn').data('url', this.getPlaylistItem().file);
                });
            return this;
        }
        , preview: function(e){
            e.preventDefault();
            var _this = this,
                $this = $(e.currentTarget),
                start = $this.data('start'),
                end = $this.data('end'),
                url = $this.data('url'),
                title = this.model.get('data_info').content.title,
                type = this.model.get('data_info').content.file.type,
                file = '/play/save/?start='+start+'&end='+end+'&url='+url;
            $('#preview').on('shown.bs.modal', function(){
                _this.player.pause();
                jwplayer('preview-player').setup({
                    base: 'assets/player/'
                    , height: 460
                    , width: '100%'
                    , autostart: true
                    , startparam: 'start'
                    , primary: 'flash'
                    , sources: [
                        {
                            title: title,
                            file: file,
                            type: type
                        }
                    ]
                });
            }).modal('show');
        }
        , save: function(e){
            e.preventDefault();
            var $this = $(e.currentTarget),
                start = $this.data('start'),
                end = $this.data('end'),
                url = $this.data('url'),
                title = this.model.get('data_info').content.title,
                type = this.model.get('data_info').content.file.type,
                name = title+'.'+type,
                file = '/play/save/?start='+start+'&end='+end+'&url='+url+'&name='+name;
            window.open(file);
        }
        , toggleEditor: function(e){
            this.$("#editor").removeClass('closed');
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});

define('text!modules/library/templates/detail_music.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li class="active"><%-data_info.content.title%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="player">\r\n    <div class="container">\r\n        <h1><%-data_info.content.title%></h1>\r\n        <div class="music-cover"><img src="<%-data_info.content.image.url_path%>" alt="<%-data_info.content.title%>"/></div>\r\n        <div class="music-player">\r\n            <video src="<%-data_info.content.file.url_path%>" controls="controls" autoplay="autoplay" id="music-player"></video>\r\n        </div>\r\n    </div>\r\n</div>\r\n<% if(related_data){ %>\r\n<div id="related">\r\n    <div class="container">\r\n        <table class="table table-striped">\r\n            <colgroup>\r\n                <col width="40"/>\r\n                <col width="60"/>\r\n                <col width="*"/>\r\n                <col width="80"/>\r\n            </colgroup>\r\n            <thead>\r\n            <tr>\r\n                <th>#</th>\r\n                <th>播放</th>\r\n                <th>标题</th>\r\n                <th></th>\r\n            </tr>\r\n            </thead>\r\n            <tbody>\r\n            <% _.each(related_data, function(res, index){%>\r\n            <tr>\r\n                <td><%-index + 1%></td>\r\n                <td><a href="#!/detail/<%=res.id%>/"><i class="icon icon-play-circle-o"></i></a></td>\r\n                <td><%=res.content.title%></td>\r\n                <td><a href="<%=res.content.file.url_path%>">下载</a></td>\r\n            </tr>\r\n            <% }); %>\r\n            </tbody>\r\n        </table>\r\n    </div>\r\n</div>\r\n<% } %>\r\n';});

define('modules/library/views/detail_music',[
    'app'
    , 'text!modules/library/templates/detail_music.html'
    , 'jwplayer'
],function(
    app
    , template
){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            var playlist = [{
                image: this.model.get('data_info').content.image.url_path
                , file:  this.model.get('data_info').content.file.url_path
                , title: this.model.get('data_info').content.title
                , type: this.model.get('data_info').content.file.type

            }];
            _.each(this.model.get('related_data'),function(play){
                playlist.push({
                    image: play.content.image.url_path,
                    file: play.content.file.url_path,
                    title: play.content.title
                });
            });
            this.player = jwplayer('music-player').setup({
                base: 'assets/player/'
                , height: 30
                , width: 580
                , autostart: true
                , primary: 'flash'
                , playlist: playlist
                , logo: {
                    hide: true
                }
            });
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});

define('text!modules/library/templates/detail_image.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li class="active"><%-data_info.content.title%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="player">\r\n    <div class="container">\r\n        <h1><%-data_info.content.title%></h1>\r\n        <div class="flexslider" id="image-slider">\r\n            <ul class="slides">\r\n                <% _.each(related_data, function(res, index){%>\r\n                <li>\r\n                    <img src="<%=res.content.file.url_path%>" />\r\n                </li>\r\n                <% }); %>\r\n            </ul>\r\n        </div>\r\n    </div>\r\n</div>\r\n';});

/*
 * jQuery FlexSlider v2.5.0
 * Copyright 2012 WooThemes
 * Contributing Author: Tyler Smith
 */
;
(function ($) {

  //FlexSlider: Object Instance
  $.flexslider = function(el, options) {
    var slider = $(el);

    // making variables public
    slider.vars = $.extend({}, $.flexslider.defaults, options);

    var namespace = slider.vars.namespace,
        msGesture = window.navigator && window.navigator.msPointerEnabled && window.MSGesture,
        touch = (( "ontouchstart" in window ) || msGesture || window.DocumentTouch && document instanceof DocumentTouch) && slider.vars.touch,
        // depricating this idea, as devices are being released with both of these events
        //eventType = (touch) ? "touchend" : "click",
        eventType = "click touchend MSPointerUp keyup",
        watchedEvent = "",
        watchedEventClearTimer,
        vertical = slider.vars.direction === "vertical",
        reverse = slider.vars.reverse,
        carousel = (slider.vars.itemWidth > 0),
        fade = slider.vars.animation === "fade",
        asNav = slider.vars.asNavFor !== "",
        methods = {},
        focused = true;

    // Store a reference to the slider object
    $.data(el, "flexslider", slider);

    // Private slider methods
    methods = {
      init: function() {
        slider.animating = false;
        // Get current slide and make sure it is a number
        slider.currentSlide = parseInt( ( slider.vars.startAt ? slider.vars.startAt : 0), 10 );
        if ( isNaN( slider.currentSlide ) ) { slider.currentSlide = 0; }
        slider.animatingTo = slider.currentSlide;
        slider.atEnd = (slider.currentSlide === 0 || slider.currentSlide === slider.last);
        slider.containerSelector = slider.vars.selector.substr(0,slider.vars.selector.search(' '));
        slider.slides = $(slider.vars.selector, slider);
        slider.container = $(slider.containerSelector, slider);
        slider.count = slider.slides.length;
        // SYNC:
        slider.syncExists = $(slider.vars.sync).length > 0;
        // SLIDE:
        if (slider.vars.animation === "slide") { slider.vars.animation = "swing"; }
        slider.prop = (vertical) ? "top" : "marginLeft";
        slider.args = {};
        // SLIDESHOW:
        slider.manualPause = false;
        slider.stopped = false;
        //PAUSE WHEN INVISIBLE
        slider.started = false;
        slider.startTimeout = null;
        // TOUCH/USECSS:
        slider.transitions = !slider.vars.video && !fade && slider.vars.useCSS && (function() {
          var obj = document.createElement('div'),
              props = ['perspectiveProperty', 'WebkitPerspective', 'MozPerspective', 'OPerspective', 'msPerspective'];
          for (var i in props) {
            if ( obj.style[ props[i] ] !== undefined ) {
              slider.pfx = props[i].replace('Perspective','').toLowerCase();
              slider.prop = "-" + slider.pfx + "-transform";
              return true;
            }
          }
          return false;
        }());
        slider.ensureAnimationEnd = '';
        // CONTROLSCONTAINER:
        if (slider.vars.controlsContainer !== "") slider.controlsContainer = $(slider.vars.controlsContainer).length > 0 && $(slider.vars.controlsContainer);
        // MANUAL:
        if (slider.vars.manualControls !== "") slider.manualControls = $(slider.vars.manualControls).length > 0 && $(slider.vars.manualControls);

        // CUSTOM DIRECTION NAV:
        if (slider.vars.customDirectionNav !== "") slider.customDirectionNav = $(slider.vars.customDirectionNav).length === 2 && $(slider.vars.customDirectionNav);

        // RANDOMIZE:
        if (slider.vars.randomize) {
          slider.slides.sort(function() { return (Math.round(Math.random())-0.5); });
          slider.container.empty().append(slider.slides);
        }

        slider.doMath();

        // INIT
        slider.setup("init");

        // CONTROLNAV:
        if (slider.vars.controlNav) { methods.controlNav.setup(); }

        // DIRECTIONNAV:
        if (slider.vars.directionNav) { methods.directionNav.setup(); }

        // KEYBOARD:
        if (slider.vars.keyboard && ($(slider.containerSelector).length === 1 || slider.vars.multipleKeyboard)) {
          $(document).bind('keyup', function(event) {
            var keycode = event.keyCode;
            if (!slider.animating && (keycode === 39 || keycode === 37)) {
              var target = (keycode === 39) ? slider.getTarget('next') :
                           (keycode === 37) ? slider.getTarget('prev') : false;
              slider.flexAnimate(target, slider.vars.pauseOnAction);
            }
          });
        }
        // MOUSEWHEEL:
        if (slider.vars.mousewheel) {
          slider.bind('mousewheel', function(event, delta, deltaX, deltaY) {
            event.preventDefault();
            var target = (delta < 0) ? slider.getTarget('next') : slider.getTarget('prev');
            slider.flexAnimate(target, slider.vars.pauseOnAction);
          });
        }

        // PAUSEPLAY
        if (slider.vars.pausePlay) { methods.pausePlay.setup(); }

        //PAUSE WHEN INVISIBLE
        if (slider.vars.slideshow && slider.vars.pauseInvisible) { methods.pauseInvisible.init(); }

        // SLIDSESHOW
        if (slider.vars.slideshow) {
          if (slider.vars.pauseOnHover) {
            slider.hover(function() {
              if (!slider.manualPlay && !slider.manualPause) { slider.pause(); }
            }, function() {
              if (!slider.manualPause && !slider.manualPlay && !slider.stopped) { slider.play(); }
            });
          }
          // initialize animation
          //If we're visible, or we don't use PageVisibility API
          if(!slider.vars.pauseInvisible || !methods.pauseInvisible.isHidden()) {
            (slider.vars.initDelay > 0) ? slider.startTimeout = setTimeout(slider.play, slider.vars.initDelay) : slider.play();
          }
        }

        // ASNAV:
        if (asNav) { methods.asNav.setup(); }

        // TOUCH
        if (touch && slider.vars.touch) { methods.touch(); }

        // FADE&&SMOOTHHEIGHT || SLIDE:
        if (!fade || (fade && slider.vars.smoothHeight)) { $(window).bind("resize orientationchange focus", methods.resize); }

        slider.find("img").attr("draggable", "false");

        // API: start() Callback
        setTimeout(function(){
          slider.vars.start(slider);
        }, 200);
      },
      asNav: {
        setup: function() {
          slider.asNav = true;
          slider.animatingTo = Math.floor(slider.currentSlide/slider.move);
          slider.currentItem = slider.currentSlide;
          slider.slides.removeClass(namespace + "active-slide").eq(slider.currentItem).addClass(namespace + "active-slide");
          if(!msGesture){
              slider.slides.on(eventType, function(e){
                e.preventDefault();
                var $slide = $(this),
                    target = $slide.index();
                var posFromLeft = $slide.offset().left - $(slider).scrollLeft(); // Find position of slide relative to left of slider container
                if( posFromLeft <= 0 && $slide.hasClass( namespace + 'active-slide' ) ) {
                  slider.flexAnimate(slider.getTarget("prev"), true);
                } else if (!$(slider.vars.asNavFor).data('flexslider').animating && !$slide.hasClass(namespace + "active-slide")) {
                  slider.direction = (slider.currentItem < target) ? "next" : "prev";
                  slider.flexAnimate(target, slider.vars.pauseOnAction, false, true, true);
                }
              });
          }else{
              el._slider = slider;
              slider.slides.each(function (){
                  var that = this;
                  that._gesture = new MSGesture();
                  that._gesture.target = that;
                  that.addEventListener("MSPointerDown", function (e){
                      e.preventDefault();
                      if(e.currentTarget._gesture) {
                        e.currentTarget._gesture.addPointer(e.pointerId);
                      }
                  }, false);
                  that.addEventListener("MSGestureTap", function (e){
                      e.preventDefault();
                      var $slide = $(this),
                          target = $slide.index();
                      if (!$(slider.vars.asNavFor).data('flexslider').animating && !$slide.hasClass('active')) {
                          slider.direction = (slider.currentItem < target) ? "next" : "prev";
                          slider.flexAnimate(target, slider.vars.pauseOnAction, false, true, true);
                      }
                  });
              });
          }
        }
      },
      controlNav: {
        setup: function() {
          if (!slider.manualControls) {
            methods.controlNav.setupPaging();
          } else { // MANUALCONTROLS:
            methods.controlNav.setupManual();
          }
        },
        setupPaging: function() {
          var type = (slider.vars.controlNav === "thumbnails") ? 'control-thumbs' : 'control-paging',
              j = 1,
              item,
              slide;

          slider.controlNavScaffold = $('<ol class="'+ namespace + 'control-nav ' + namespace + type + '"></ol>');

          if (slider.pagingCount > 1) {
            for (var i = 0; i < slider.pagingCount; i++) {
              slide = slider.slides.eq(i);
              item = (slider.vars.controlNav === "thumbnails") ? '<img src="' + slide.attr( 'data-thumb' ) + '"/>' : '<a>' + j + '</a>';
              if ( 'thumbnails' === slider.vars.controlNav && true === slider.vars.thumbCaptions ) {
                var captn = slide.attr( 'data-thumbcaption' );
                if ( '' !== captn && undefined !== captn ) { item += '<span class="' + namespace + 'caption">' + captn + '</span>'; }
              }
              slider.controlNavScaffold.append('<li>' + item + '</li>');
              j++;
            }
          }

          // CONTROLSCONTAINER:
          (slider.controlsContainer) ? $(slider.controlsContainer).append(slider.controlNavScaffold) : slider.append(slider.controlNavScaffold);
          methods.controlNav.set();

          methods.controlNav.active();

          slider.controlNavScaffold.delegate('a, img', eventType, function(event) {
            event.preventDefault();

            if (watchedEvent === "" || watchedEvent === event.type) {
              var $this = $(this),
                  target = slider.controlNav.index($this);

              if (!$this.hasClass(namespace + 'active')) {
                slider.direction = (target > slider.currentSlide) ? "next" : "prev";
                slider.flexAnimate(target, slider.vars.pauseOnAction);
              }
            }

            // setup flags to prevent event duplication
            if (watchedEvent === "") {
              watchedEvent = event.type;
            }
            methods.setToClearWatchedEvent();

          });
        },
        setupManual: function() {
          slider.controlNav = slider.manualControls;
          methods.controlNav.active();

          slider.controlNav.bind(eventType, function(event) {
            event.preventDefault();

            if (watchedEvent === "" || watchedEvent === event.type) {
              var $this = $(this),
                  target = slider.controlNav.index($this);

              if (!$this.hasClass(namespace + 'active')) {
                (target > slider.currentSlide) ? slider.direction = "next" : slider.direction = "prev";
                slider.flexAnimate(target, slider.vars.pauseOnAction);
              }
            }

            // setup flags to prevent event duplication
            if (watchedEvent === "") {
              watchedEvent = event.type;
            }
            methods.setToClearWatchedEvent();
          });
        },
        set: function() {
          var selector = (slider.vars.controlNav === "thumbnails") ? 'img' : 'a';
          slider.controlNav = $('.' + namespace + 'control-nav li ' + selector, (slider.controlsContainer) ? slider.controlsContainer : slider);
        },
        active: function() {
          slider.controlNav.removeClass(namespace + "active").eq(slider.animatingTo).addClass(namespace + "active");
        },
        update: function(action, pos) {
          if (slider.pagingCount > 1 && action === "add") {
            slider.controlNavScaffold.append($('<li><a>' + slider.count + '</a></li>'));
          } else if (slider.pagingCount === 1) {
            slider.controlNavScaffold.find('li').remove();
          } else {
            slider.controlNav.eq(pos).closest('li').remove();
          }
          methods.controlNav.set();
          (slider.pagingCount > 1 && slider.pagingCount !== slider.controlNav.length) ? slider.update(pos, action) : methods.controlNav.active();
        }
      },
      directionNav: {
        setup: function() {
          var directionNavScaffold = $('<ul class="' + namespace + 'direction-nav"><li class="' + namespace + 'nav-prev"><a class="' + namespace + 'prev" href="#">' + slider.vars.prevText + '</a></li><li class="' + namespace + 'nav-next"><a class="' + namespace + 'next" href="#">' + slider.vars.nextText + '</a></li></ul>');

          // CUSTOM DIRECTION NAV:
          if (slider.customDirectionNav) {
            slider.directionNav = slider.customDirectionNav;
          // CONTROLSCONTAINER:
          } else if (slider.controlsContainer) {
            $(slider.controlsContainer).append(directionNavScaffold);
            slider.directionNav = $('.' + namespace + 'direction-nav li a', slider.controlsContainer);
          } else {
            slider.append(directionNavScaffold);
            slider.directionNav = $('.' + namespace + 'direction-nav li a', slider);
          }

          methods.directionNav.update();

          slider.directionNav.bind(eventType, function(event) {
            event.preventDefault();
            var target;

            if (watchedEvent === "" || watchedEvent === event.type) {
              target = ($(this).hasClass(namespace + 'next')) ? slider.getTarget('next') : slider.getTarget('prev');
              slider.flexAnimate(target, slider.vars.pauseOnAction);
            }

            // setup flags to prevent event duplication
            if (watchedEvent === "") {
              watchedEvent = event.type;
            }
            methods.setToClearWatchedEvent();
          });
        },
        update: function() {
          var disabledClass = namespace + 'disabled';
          if (slider.pagingCount === 1) {
            slider.directionNav.addClass(disabledClass).attr('tabindex', '-1');
          } else if (!slider.vars.animationLoop) {
            if (slider.animatingTo === 0) {
              slider.directionNav.removeClass(disabledClass).filter('.' + namespace + "prev").addClass(disabledClass).attr('tabindex', '-1');
            } else if (slider.animatingTo === slider.last) {
              slider.directionNav.removeClass(disabledClass).filter('.' + namespace + "next").addClass(disabledClass).attr('tabindex', '-1');
            } else {
              slider.directionNav.removeClass(disabledClass).removeAttr('tabindex');
            }
          } else {
            slider.directionNav.removeClass(disabledClass).removeAttr('tabindex');
          }
        }
      },
      pausePlay: {
        setup: function() {
          var pausePlayScaffold = $('<div class="' + namespace + 'pauseplay"><a></a></div>');

          // CONTROLSCONTAINER:
          if (slider.controlsContainer) {
            slider.controlsContainer.append(pausePlayScaffold);
            slider.pausePlay = $('.' + namespace + 'pauseplay a', slider.controlsContainer);
          } else {
            slider.append(pausePlayScaffold);
            slider.pausePlay = $('.' + namespace + 'pauseplay a', slider);
          }

          methods.pausePlay.update((slider.vars.slideshow) ? namespace + 'pause' : namespace + 'play');

          slider.pausePlay.bind(eventType, function(event) {
            event.preventDefault();

            if (watchedEvent === "" || watchedEvent === event.type) {
              if ($(this).hasClass(namespace + 'pause')) {
                slider.manualPause = true;
                slider.manualPlay = false;
                slider.pause();
              } else {
                slider.manualPause = false;
                slider.manualPlay = true;
                slider.play();
              }
            }

            // setup flags to prevent event duplication
            if (watchedEvent === "") {
              watchedEvent = event.type;
            }
            methods.setToClearWatchedEvent();
          });
        },
        update: function(state) {
          (state === "play") ? slider.pausePlay.removeClass(namespace + 'pause').addClass(namespace + 'play').html(slider.vars.playText) : slider.pausePlay.removeClass(namespace + 'play').addClass(namespace + 'pause').html(slider.vars.pauseText);
        }
      },
      touch: function() {
        var startX,
          startY,
          offset,
          cwidth,
          dx,
          startT,
          onTouchStart,
          onTouchMove,
          onTouchEnd,
          scrolling = false,
          localX = 0,
          localY = 0,
          accDx = 0;

        if(!msGesture){
            onTouchStart = function(e) {
              if (slider.animating) {
                e.preventDefault();
              } else if ( ( window.navigator.msPointerEnabled ) || e.touches.length === 1 ) {
                slider.pause();
                // CAROUSEL:
                cwidth = (vertical) ? slider.h : slider. w;
                startT = Number(new Date());
                // CAROUSEL:

                // Local vars for X and Y points.
                localX = e.touches[0].pageX;
                localY = e.touches[0].pageY;

                offset = (carousel && reverse && slider.animatingTo === slider.last) ? 0 :
                         (carousel && reverse) ? slider.limit - (((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.animatingTo) :
                         (carousel && slider.currentSlide === slider.last) ? slider.limit :
                         (carousel) ? ((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.currentSlide :
                         (reverse) ? (slider.last - slider.currentSlide + slider.cloneOffset) * cwidth : (slider.currentSlide + slider.cloneOffset) * cwidth;
                startX = (vertical) ? localY : localX;
                startY = (vertical) ? localX : localY;

                el.addEventListener('touchmove', onTouchMove, false);
                el.addEventListener('touchend', onTouchEnd, false);
              }
            };

            onTouchMove = function(e) {
              // Local vars for X and Y points.

              localX = e.touches[0].pageX;
              localY = e.touches[0].pageY;

              dx = (vertical) ? startX - localY : startX - localX;
              scrolling = (vertical) ? (Math.abs(dx) < Math.abs(localX - startY)) : (Math.abs(dx) < Math.abs(localY - startY));

              var fxms = 500;

              if ( ! scrolling || Number( new Date() ) - startT > fxms ) {
                e.preventDefault();
                if (!fade && slider.transitions) {
                  if (!slider.vars.animationLoop) {
                    dx = dx/((slider.currentSlide === 0 && dx < 0 || slider.currentSlide === slider.last && dx > 0) ? (Math.abs(dx)/cwidth+2) : 1);
                  }
                  slider.setProps(offset + dx, "setTouch");
                }
              }
            };

            onTouchEnd = function(e) {
              // finish the touch by undoing the touch session
              el.removeEventListener('touchmove', onTouchMove, false);

              if (slider.animatingTo === slider.currentSlide && !scrolling && !(dx === null)) {
                var updateDx = (reverse) ? -dx : dx,
                    target = (updateDx > 0) ? slider.getTarget('next') : slider.getTarget('prev');

                if (slider.canAdvance(target) && (Number(new Date()) - startT < 550 && Math.abs(updateDx) > 50 || Math.abs(updateDx) > cwidth/2)) {
                  slider.flexAnimate(target, slider.vars.pauseOnAction);
                } else {
                  if (!fade) { slider.flexAnimate(slider.currentSlide, slider.vars.pauseOnAction, true); }
                }
              }
              el.removeEventListener('touchend', onTouchEnd, false);

              startX = null;
              startY = null;
              dx = null;
              offset = null;
            };

            el.addEventListener('touchstart', onTouchStart, false);
        }else{
            el.style.msTouchAction = "none";
            el._gesture = new MSGesture();
            el._gesture.target = el;
            el.addEventListener("MSPointerDown", onMSPointerDown, false);
            el._slider = slider;
            el.addEventListener("MSGestureChange", onMSGestureChange, false);
            el.addEventListener("MSGestureEnd", onMSGestureEnd, false);

            function onMSPointerDown(e){
                e.stopPropagation();
                if (slider.animating) {
                    e.preventDefault();
                }else{
                    slider.pause();
                    el._gesture.addPointer(e.pointerId);
                    accDx = 0;
                    cwidth = (vertical) ? slider.h : slider. w;
                    startT = Number(new Date());
                    // CAROUSEL:

                    offset = (carousel && reverse && slider.animatingTo === slider.last) ? 0 :
                        (carousel && reverse) ? slider.limit - (((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.animatingTo) :
                            (carousel && slider.currentSlide === slider.last) ? slider.limit :
                                (carousel) ? ((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.currentSlide :
                                    (reverse) ? (slider.last - slider.currentSlide + slider.cloneOffset) * cwidth : (slider.currentSlide + slider.cloneOffset) * cwidth;
                }
            }

            function onMSGestureChange(e) {
                e.stopPropagation();
                var slider = e.target._slider;
                if(!slider){
                    return;
                }
                var transX = -e.translationX,
                    transY = -e.translationY;

                //Accumulate translations.
                accDx = accDx + ((vertical) ? transY : transX);
                dx = accDx;
                scrolling = (vertical) ? (Math.abs(accDx) < Math.abs(-transX)) : (Math.abs(accDx) < Math.abs(-transY));

                if(e.detail === e.MSGESTURE_FLAG_INERTIA){
                    setImmediate(function (){
                        el._gesture.stop();
                    });

                    return;
                }

                if (!scrolling || Number(new Date()) - startT > 500) {
                    e.preventDefault();
                    if (!fade && slider.transitions) {
                        if (!slider.vars.animationLoop) {
                            dx = accDx / ((slider.currentSlide === 0 && accDx < 0 || slider.currentSlide === slider.last && accDx > 0) ? (Math.abs(accDx) / cwidth + 2) : 1);
                        }
                        slider.setProps(offset + dx, "setTouch");
                    }
                }
            }

            function onMSGestureEnd(e) {
                e.stopPropagation();
                var slider = e.target._slider;
                if(!slider){
                    return;
                }
                if (slider.animatingTo === slider.currentSlide && !scrolling && !(dx === null)) {
                    var updateDx = (reverse) ? -dx : dx,
                        target = (updateDx > 0) ? slider.getTarget('next') : slider.getTarget('prev');

                    if (slider.canAdvance(target) && (Number(new Date()) - startT < 550 && Math.abs(updateDx) > 50 || Math.abs(updateDx) > cwidth/2)) {
                        slider.flexAnimate(target, slider.vars.pauseOnAction);
                    } else {
                        if (!fade) { slider.flexAnimate(slider.currentSlide, slider.vars.pauseOnAction, true); }
                    }
                }

                startX = null;
                startY = null;
                dx = null;
                offset = null;
                accDx = 0;
            }
        }
      },
      resize: function() {
        if (!slider.animating && slider.is(':visible')) {
          if (!carousel) { slider.doMath(); }

          if (fade) {
            // SMOOTH HEIGHT:
            methods.smoothHeight();
          } else if (carousel) { //CAROUSEL:
            slider.slides.width(slider.computedW);
            slider.update(slider.pagingCount);
            slider.setProps();
          }
          else if (vertical) { //VERTICAL:
            slider.viewport.height(slider.h);
            slider.setProps(slider.h, "setTotal");
          } else {
            // SMOOTH HEIGHT:
            if (slider.vars.smoothHeight) { methods.smoothHeight(); }
            slider.newSlides.width(slider.computedW);
            slider.setProps(slider.computedW, "setTotal");
          }
        }
      },
      smoothHeight: function(dur) {
        if (!vertical || fade) {
          var $obj = (fade) ? slider : slider.viewport;
          (dur) ? $obj.animate({"height": slider.slides.eq(slider.animatingTo).height()}, dur) : $obj.height(slider.slides.eq(slider.animatingTo).height());
        }
      },
      sync: function(action) {
        var $obj = $(slider.vars.sync).data("flexslider"),
            target = slider.animatingTo;

        switch (action) {
          case "animate": $obj.flexAnimate(target, slider.vars.pauseOnAction, false, true); break;
          case "play": if (!$obj.playing && !$obj.asNav) { $obj.play(); } break;
          case "pause": $obj.pause(); break;
        }
      },
      uniqueID: function($clone) {
        // Append _clone to current level and children elements with id attributes
        $clone.filter( '[id]' ).add($clone.find( '[id]' )).each(function() {
          var $this = $(this);
          $this.attr( 'id', $this.attr( 'id' ) + '_clone' );
        });
        return $clone;
      },
      pauseInvisible: {
        visProp: null,
        init: function() {
          var visProp = methods.pauseInvisible.getHiddenProp();
          if (visProp) {
            var evtname = visProp.replace(/[H|h]idden/,'') + 'visibilitychange';
            document.addEventListener(evtname, function() {
              if (methods.pauseInvisible.isHidden()) {
                if(slider.startTimeout) {
                  clearTimeout(slider.startTimeout); //If clock is ticking, stop timer and prevent from starting while invisible
                } else { 
                  slider.pause(); //Or just pause
                }
              }
              else {
                if(slider.started) {
                  slider.play(); //Initiated before, just play
                } else { 
                  if (slider.vars.initDelay > 0) { 
                    setTimeout(slider.play, slider.vars.initDelay);
                  } else {
                    slider.play(); //Didn't init before: simply init or wait for it
                  } 
                }
              }
            });
          }
        },
        isHidden: function() {
          var prop = methods.pauseInvisible.getHiddenProp();
          if (!prop) {
            return false;
          }
          return document[prop];
        },
        getHiddenProp: function() {
          var prefixes = ['webkit','moz','ms','o'];
          // if 'hidden' is natively supported just return it
          if ('hidden' in document) {
            return 'hidden';
          }
          // otherwise loop over all the known prefixes until we find one
          for ( var i = 0; i < prefixes.length; i++ ) {
              if ((prefixes[i] + 'Hidden') in document) {
                return prefixes[i] + 'Hidden';
              }
          }
          // otherwise it's not supported
          return null;
        }
      },
      setToClearWatchedEvent: function() {
        clearTimeout(watchedEventClearTimer);
        watchedEventClearTimer = setTimeout(function() {
          watchedEvent = "";
        }, 3000);
      }
    };

    // public methods
    slider.flexAnimate = function(target, pause, override, withSync, fromNav) {
      if (!slider.vars.animationLoop && target !== slider.currentSlide) {
        slider.direction = (target > slider.currentSlide) ? "next" : "prev";
      }

      if (asNav && slider.pagingCount === 1) slider.direction = (slider.currentItem < target) ? "next" : "prev";

      if (!slider.animating && (slider.canAdvance(target, fromNav) || override) && slider.is(":visible")) {
        if (asNav && withSync) {
          var master = $(slider.vars.asNavFor).data('flexslider');
          slider.atEnd = target === 0 || target === slider.count - 1;
          master.flexAnimate(target, true, false, true, fromNav);
          slider.direction = (slider.currentItem < target) ? "next" : "prev";
          master.direction = slider.direction;

          if (Math.ceil((target + 1)/slider.visible) - 1 !== slider.currentSlide && target !== 0) {
            slider.currentItem = target;
            slider.slides.removeClass(namespace + "active-slide").eq(target).addClass(namespace + "active-slide");
            target = Math.floor(target/slider.visible);
          } else {
            slider.currentItem = target;
            slider.slides.removeClass(namespace + "active-slide").eq(target).addClass(namespace + "active-slide");
            return false;
          }
        }

        slider.animating = true;
        slider.animatingTo = target;

        // SLIDESHOW:
        if (pause) { slider.pause(); }

        // API: before() animation Callback
        slider.vars.before(slider);

        // SYNC:
        if (slider.syncExists && !fromNav) { methods.sync("animate"); }

        // CONTROLNAV
        if (slider.vars.controlNav) { methods.controlNav.active(); }

        // !CAROUSEL:
        // CANDIDATE: slide active class (for add/remove slide)
        if (!carousel) { slider.slides.removeClass(namespace + 'active-slide').eq(target).addClass(namespace + 'active-slide'); }

        // INFINITE LOOP:
        // CANDIDATE: atEnd
        slider.atEnd = target === 0 || target === slider.last;

        // DIRECTIONNAV:
        if (slider.vars.directionNav) { methods.directionNav.update(); }

        if (target === slider.last) {
          // API: end() of cycle Callback
          slider.vars.end(slider);
          // SLIDESHOW && !INFINITE LOOP:
          if (!slider.vars.animationLoop) { slider.pause(); }
        }

        // SLIDE:
        if (!fade) {
          var dimension = (vertical) ? slider.slides.filter(':first').height() : slider.computedW,
              margin, slideString, calcNext;

          // INFINITE LOOP / REVERSE:
          if (carousel) {
            //margin = (slider.vars.itemWidth > slider.w) ? slider.vars.itemMargin * 2 : slider.vars.itemMargin;
            margin = slider.vars.itemMargin;
            calcNext = ((slider.itemW + margin) * slider.move) * slider.animatingTo;
            slideString = (calcNext > slider.limit && slider.visible !== 1) ? slider.limit : calcNext;
          } else if (slider.currentSlide === 0 && target === slider.count - 1 && slider.vars.animationLoop && slider.direction !== "next") {
            slideString = (reverse) ? (slider.count + slider.cloneOffset) * dimension : 0;
          } else if (slider.currentSlide === slider.last && target === 0 && slider.vars.animationLoop && slider.direction !== "prev") {
            slideString = (reverse) ? 0 : (slider.count + 1) * dimension;
          } else {
            slideString = (reverse) ? ((slider.count - 1) - target + slider.cloneOffset) * dimension : (target + slider.cloneOffset) * dimension;
          }
          slider.setProps(slideString, "", slider.vars.animationSpeed);
          if (slider.transitions) {
            if (!slider.vars.animationLoop || !slider.atEnd) {
              slider.animating = false;
              slider.currentSlide = slider.animatingTo;
            }
            
            // Unbind previous transitionEnd events and re-bind new transitionEnd event
            slider.container.unbind("webkitTransitionEnd transitionend");
            slider.container.bind("webkitTransitionEnd transitionend", function() {
              clearTimeout(slider.ensureAnimationEnd);
              slider.wrapup(dimension);
            });

            // Insurance for the ever-so-fickle transitionEnd event
            clearTimeout(slider.ensureAnimationEnd);
            slider.ensureAnimationEnd = setTimeout(function() {
              slider.wrapup(dimension);
            }, slider.vars.animationSpeed + 100);

          } else {
            slider.container.animate(slider.args, slider.vars.animationSpeed, slider.vars.easing, function(){
              slider.wrapup(dimension);
            });
          }
        } else { // FADE:
          if (!touch) {
            //slider.slides.eq(slider.currentSlide).fadeOut(slider.vars.animationSpeed, slider.vars.easing);
            //slider.slides.eq(target).fadeIn(slider.vars.animationSpeed, slider.vars.easing, slider.wrapup);

            slider.slides.eq(slider.currentSlide).css({"zIndex": 1}).animate({"opacity": 0}, slider.vars.animationSpeed, slider.vars.easing);
            slider.slides.eq(target).css({"zIndex": 2}).animate({"opacity": 1}, slider.vars.animationSpeed, slider.vars.easing, slider.wrapup);

          } else {
            slider.slides.eq(slider.currentSlide).css({ "opacity": 0, "zIndex": 1 });
            slider.slides.eq(target).css({ "opacity": 1, "zIndex": 2 });
            slider.wrapup(dimension);
          }
        }
        // SMOOTH HEIGHT:
        if (slider.vars.smoothHeight) { methods.smoothHeight(slider.vars.animationSpeed); }
      }
    };
    slider.wrapup = function(dimension) {
      // SLIDE:
      if (!fade && !carousel) {
        if (slider.currentSlide === 0 && slider.animatingTo === slider.last && slider.vars.animationLoop) {
          slider.setProps(dimension, "jumpEnd");
        } else if (slider.currentSlide === slider.last && slider.animatingTo === 0 && slider.vars.animationLoop) {
          slider.setProps(dimension, "jumpStart");
        }
      }
      slider.animating = false;
      slider.currentSlide = slider.animatingTo;
      // API: after() animation Callback
      slider.vars.after(slider);
    };

    // SLIDESHOW:
    slider.animateSlides = function() {
      if (!slider.animating && focused ) { slider.flexAnimate(slider.getTarget("next")); }
    };
    // SLIDESHOW:
    slider.pause = function() {
      clearInterval(slider.animatedSlides);
      slider.animatedSlides = null;
      slider.playing = false;
      // PAUSEPLAY:
      if (slider.vars.pausePlay) { methods.pausePlay.update("play"); }
      // SYNC:
      if (slider.syncExists) { methods.sync("pause"); }
    };
    // SLIDESHOW:
    slider.play = function() {
      if (slider.playing) { clearInterval(slider.animatedSlides); }
      slider.animatedSlides = slider.animatedSlides || setInterval(slider.animateSlides, slider.vars.slideshowSpeed);
      slider.started = slider.playing = true;
      // PAUSEPLAY:
      if (slider.vars.pausePlay) { methods.pausePlay.update("pause"); }
      // SYNC:
      if (slider.syncExists) { methods.sync("play"); }
    };
    // STOP:
    slider.stop = function () {
      slider.pause();
      slider.stopped = true;
    };
    slider.canAdvance = function(target, fromNav) {
      // ASNAV:
      var last = (asNav) ? slider.pagingCount - 1 : slider.last;
      return (fromNav) ? true :
             (asNav && slider.currentItem === slider.count - 1 && target === 0 && slider.direction === "prev") ? true :
             (asNav && slider.currentItem === 0 && target === slider.pagingCount - 1 && slider.direction !== "next") ? false :
             (target === slider.currentSlide && !asNav) ? false :
             (slider.vars.animationLoop) ? true :
             (slider.atEnd && slider.currentSlide === 0 && target === last && slider.direction !== "next") ? false :
             (slider.atEnd && slider.currentSlide === last && target === 0 && slider.direction === "next") ? false :
             true;
    };
    slider.getTarget = function(dir) {
      slider.direction = dir;
      if (dir === "next") {
        return (slider.currentSlide === slider.last) ? 0 : slider.currentSlide + 1;
      } else {
        return (slider.currentSlide === 0) ? slider.last : slider.currentSlide - 1;
      }
    };

    // SLIDE:
    slider.setProps = function(pos, special, dur) {
      var target = (function() {
        var posCheck = (pos) ? pos : ((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.animatingTo,
            posCalc = (function() {
              if (carousel) {
                return (special === "setTouch") ? pos :
                       (reverse && slider.animatingTo === slider.last) ? 0 :
                       (reverse) ? slider.limit - (((slider.itemW + slider.vars.itemMargin) * slider.move) * slider.animatingTo) :
                       (slider.animatingTo === slider.last) ? slider.limit : posCheck;
              } else {
                switch (special) {
                  case "setTotal": return (reverse) ? ((slider.count - 1) - slider.currentSlide + slider.cloneOffset) * pos : (slider.currentSlide + slider.cloneOffset) * pos;
                  case "setTouch": return (reverse) ? pos : pos;
                  case "jumpEnd": return (reverse) ? pos : slider.count * pos;
                  case "jumpStart": return (reverse) ? slider.count * pos : pos;
                  default: return pos;
                }
              }
            }());

            return (posCalc * -1) + "px";
          }());

      if (slider.transitions) {
        target = (vertical) ? "translate3d(0," + target + ",0)" : "translate3d(" + target + ",0,0)";
        dur = (dur !== undefined) ? (dur/1000) + "s" : "0s";
        slider.container.css("-" + slider.pfx + "-transition-duration", dur);
         slider.container.css("transition-duration", dur);
      }

      slider.args[slider.prop] = target;
      if (slider.transitions || dur === undefined) { slider.container.css(slider.args); }

      slider.container.css('transform',target);
    };

    slider.setup = function(type) {
      // SLIDE:
      if (!fade) {
        var sliderOffset, arr;

        if (type === "init") {
          slider.viewport = $('<div class="' + namespace + 'viewport"></div>').css({"overflow": "hidden", "position": "relative"}).appendTo(slider).append(slider.container);
          // INFINITE LOOP:
          slider.cloneCount = 0;
          slider.cloneOffset = 0;
          // REVERSE:
          if (reverse) {
            arr = $.makeArray(slider.slides).reverse();
            slider.slides = $(arr);
            slider.container.empty().append(slider.slides);
          }
        }
        // INFINITE LOOP && !CAROUSEL:
        if (slider.vars.animationLoop && !carousel) {
          slider.cloneCount = 2;
          slider.cloneOffset = 1;
          // clear out old clones
          if (type !== "init") { slider.container.find('.clone').remove(); }
          slider.container.append(methods.uniqueID(slider.slides.first().clone().addClass('clone')).attr('aria-hidden', 'true'))
                          .prepend(methods.uniqueID(slider.slides.last().clone().addClass('clone')).attr('aria-hidden', 'true'));
        }
        slider.newSlides = $(slider.vars.selector, slider);

        sliderOffset = (reverse) ? slider.count - 1 - slider.currentSlide + slider.cloneOffset : slider.currentSlide + slider.cloneOffset;
        // VERTICAL:
        if (vertical && !carousel) {
          slider.container.height((slider.count + slider.cloneCount) * 200 + "%").css("position", "absolute").width("100%");
          setTimeout(function(){
            slider.newSlides.css({"display": "block"});
            slider.doMath();
            slider.viewport.height(slider.h);
            slider.setProps(sliderOffset * slider.h, "init");
          }, (type === "init") ? 100 : 0);
        } else {
          slider.container.width((slider.count + slider.cloneCount) * 200 + "%");
          slider.setProps(sliderOffset * slider.computedW, "init");
          setTimeout(function(){
            slider.doMath();
            slider.newSlides.css({"width": slider.computedW, "float": "left", "display": "block"});
            // SMOOTH HEIGHT:
            if (slider.vars.smoothHeight) { methods.smoothHeight(); }
          }, (type === "init") ? 100 : 0);
        }
      } else { // FADE:
        slider.slides.css({"width": "100%", "float": "left", "marginRight": "-100%", "position": "relative"});
        if (type === "init") {
          if (!touch) {
            //slider.slides.eq(slider.currentSlide).fadeIn(slider.vars.animationSpeed, slider.vars.easing);
            if (slider.vars.fadeFirstSlide == false) {
              slider.slides.css({ "opacity": 0, "display": "block", "zIndex": 1 }).eq(slider.currentSlide).css({"zIndex": 2}).css({"opacity": 1});
            } else {
              slider.slides.css({ "opacity": 0, "display": "block", "zIndex": 1 }).eq(slider.currentSlide).css({"zIndex": 2}).animate({"opacity": 1},slider.vars.animationSpeed,slider.vars.easing);
            }
          } else {
            slider.slides.css({ "opacity": 0, "display": "block", "webkitTransition": "opacity " + slider.vars.animationSpeed / 1000 + "s ease", "zIndex": 1 }).eq(slider.currentSlide).css({ "opacity": 1, "zIndex": 2});
          }
        }
        // SMOOTH HEIGHT:
        if (slider.vars.smoothHeight) { methods.smoothHeight(); }
      }
      // !CAROUSEL:
      // CANDIDATE: active slide
      if (!carousel) { slider.slides.removeClass(namespace + "active-slide").eq(slider.currentSlide).addClass(namespace + "active-slide"); }

      //FlexSlider: init() Callback
      slider.vars.init(slider);
    };

    slider.doMath = function() {
      var slide = slider.slides.first(),
          slideMargin = slider.vars.itemMargin,
          minItems = slider.vars.minItems,
          maxItems = slider.vars.maxItems;

      slider.w = (slider.viewport===undefined) ? slider.width() : slider.viewport.width();
      slider.h = slide.height();
      slider.boxPadding = slide.outerWidth() - slide.width();

      // CAROUSEL:
      if (carousel) {
        slider.itemT = slider.vars.itemWidth + slideMargin;
        slider.minW = (minItems) ? minItems * slider.itemT : slider.w;
        slider.maxW = (maxItems) ? (maxItems * slider.itemT) - slideMargin : slider.w;
        slider.itemW = (slider.minW > slider.w) ? (slider.w - (slideMargin * (minItems - 1)))/minItems :
                       (slider.maxW < slider.w) ? (slider.w - (slideMargin * (maxItems - 1)))/maxItems :
                       (slider.vars.itemWidth > slider.w) ? slider.w : slider.vars.itemWidth;

        slider.visible = Math.floor(slider.w/(slider.itemW));
        slider.move = (slider.vars.move > 0 && slider.vars.move < slider.visible ) ? slider.vars.move : slider.visible;
        slider.pagingCount = Math.ceil(((slider.count - slider.visible)/slider.move) + 1);
        slider.last =  slider.pagingCount - 1;
        slider.limit = (slider.pagingCount === 1) ? 0 :
                       (slider.vars.itemWidth > slider.w) ? (slider.itemW * (slider.count - 1)) + (slideMargin * (slider.count - 1)) : ((slider.itemW + slideMargin) * slider.count) - slider.w - slideMargin;
      } else {
        slider.itemW = slider.w;
        slider.pagingCount = slider.count;
        slider.last = slider.count - 1;
      }
      slider.computedW = slider.itemW - slider.boxPadding;
    };

    slider.update = function(pos, action) {
      slider.doMath();

      // update currentSlide and slider.animatingTo if necessary
      if (!carousel) {
        if (pos < slider.currentSlide) {
          slider.currentSlide += 1;
        } else if (pos <= slider.currentSlide && pos !== 0) {
          slider.currentSlide -= 1;
        }
        slider.animatingTo = slider.currentSlide;
      }

      // update controlNav
      if (slider.vars.controlNav && !slider.manualControls) {
        if ((action === "add" && !carousel) || slider.pagingCount > slider.controlNav.length) {
          methods.controlNav.update("add");
        } else if ((action === "remove" && !carousel) || slider.pagingCount < slider.controlNav.length) {
          if (carousel && slider.currentSlide > slider.last) {
            slider.currentSlide -= 1;
            slider.animatingTo -= 1;
          }
          methods.controlNav.update("remove", slider.last);
        }
      }
      // update directionNav
      if (slider.vars.directionNav) { methods.directionNav.update(); }

    };

    slider.addSlide = function(obj, pos) {
      var $obj = $(obj);

      slider.count += 1;
      slider.last = slider.count - 1;

      // append new slide
      if (vertical && reverse) {
        (pos !== undefined) ? slider.slides.eq(slider.count - pos).after($obj) : slider.container.prepend($obj);
      } else {
        (pos !== undefined) ? slider.slides.eq(pos).before($obj) : slider.container.append($obj);
      }

      // update currentSlide, animatingTo, controlNav, and directionNav
      slider.update(pos, "add");

      // update slider.slides
      slider.slides = $(slider.vars.selector + ':not(.clone)', slider);
      // re-setup the slider to accomdate new slide
      slider.setup();

      //FlexSlider: added() Callback
      slider.vars.added(slider);
    };
    slider.removeSlide = function(obj) {
      var pos = (isNaN(obj)) ? slider.slides.index($(obj)) : obj;

      // update count
      slider.count -= 1;
      slider.last = slider.count - 1;

      // remove slide
      if (isNaN(obj)) {
        $(obj, slider.slides).remove();
      } else {
        (vertical && reverse) ? slider.slides.eq(slider.last).remove() : slider.slides.eq(obj).remove();
      }

      // update currentSlide, animatingTo, controlNav, and directionNav
      slider.doMath();
      slider.update(pos, "remove");

      // update slider.slides
      slider.slides = $(slider.vars.selector + ':not(.clone)', slider);
      // re-setup the slider to accomdate new slide
      slider.setup();

      // FlexSlider: removed() Callback
      slider.vars.removed(slider);
    };

    //FlexSlider: Initialize
    methods.init();
  };

  // Ensure the slider isn't focussed if the window loses focus.
  $( window ).blur( function ( e ) {
    focused = false;
  }).focus( function ( e ) {
    focused = true;
  });

  //FlexSlider: Default Settings
  $.flexslider.defaults = {
    namespace: "flex-",             //{NEW} String: Prefix string attached to the class of every element generated by the plugin
    selector: ".slides > li",       //{NEW} Selector: Must match a simple pattern. '{container} > {slide}' -- Ignore pattern at your own peril
    animation: "fade",              //String: Select your animation type, "fade" or "slide"
    easing: "swing",                //{NEW} String: Determines the easing method used in jQuery transitions. jQuery easing plugin is supported!
    direction: "horizontal",        //String: Select the sliding direction, "horizontal" or "vertical"
    reverse: false,                 //{NEW} Boolean: Reverse the animation direction
    animationLoop: true,            //Boolean: Should the animation loop? If false, directionNav will received "disable" classes at either end
    smoothHeight: false,            //{NEW} Boolean: Allow height of the slider to animate smoothly in horizontal mode
    startAt: 0,                     //Integer: The slide that the slider should start on. Array notation (0 = first slide)
    slideshow: true,                //Boolean: Animate slider automatically
    slideshowSpeed: 7000,           //Integer: Set the speed of the slideshow cycling, in milliseconds
    animationSpeed: 600,            //Integer: Set the speed of animations, in milliseconds
    initDelay: 0,                   //{NEW} Integer: Set an initialization delay, in milliseconds
    randomize: false,               //Boolean: Randomize slide order
    fadeFirstSlide: true,           //Boolean: Fade in the first slide when animation type is "fade"
    thumbCaptions: false,           //Boolean: Whether or not to put captions on thumbnails when using the "thumbnails" controlNav.

    // Usability features
    pauseOnAction: true,            //Boolean: Pause the slideshow when interacting with control elements, highly recommended.
    pauseOnHover: false,            //Boolean: Pause the slideshow when hovering over slider, then resume when no longer hovering
    pauseInvisible: true,   		//{NEW} Boolean: Pause the slideshow when tab is invisible, resume when visible. Provides better UX, lower CPU usage.
    useCSS: true,                   //{NEW} Boolean: Slider will use CSS3 transitions if available
    touch: true,                    //{NEW} Boolean: Allow touch swipe navigation of the slider on touch-enabled devices
    video: false,                   //{NEW} Boolean: If using video in the slider, will prevent CSS3 3D Transforms to avoid graphical glitches

    // Primary Controls
    controlNav: true,               //Boolean: Create navigation for paging control of each slide? Note: Leave true for manualControls usage
    directionNav: true,             //Boolean: Create navigation for previous/next navigation? (true/false)
    prevText: "Previous",           //String: Set the text for the "previous" directionNav item
    nextText: "Next",               //String: Set the text for the "next" directionNav item

    // Secondary Navigation
    keyboard: true,                 //Boolean: Allow slider navigating via keyboard left/right keys
    multipleKeyboard: false,        //{NEW} Boolean: Allow keyboard navigation to affect multiple sliders. Default behavior cuts out keyboard navigation with more than one slider present.
    mousewheel: false,              //{UPDATED} Boolean: Requires jquery.mousewheel.js (https://github.com/brandonaaron/jquery-mousewheel) - Allows slider navigating via mousewheel
    pausePlay: false,               //Boolean: Create pause/play dynamic element
    pauseText: "Pause",             //String: Set the text for the "pause" pausePlay item
    playText: "Play",               //String: Set the text for the "play" pausePlay item

    // Special properties
    controlsContainer: "",          //{UPDATED} jQuery Object/Selector: Declare which container the navigation elements should be appended too. Default container is the FlexSlider element. Example use would be $(".flexslider-container"). Property is ignored if given element is not found.
    manualControls: "",             //{UPDATED} jQuery Object/Selector: Declare custom control navigation. Examples would be $(".flex-control-nav li") or "#tabs-nav li img", etc. The number of elements in your controlNav should match the number of slides/tabs.
    customDirectionNav: "",         //{NEW} jQuery Object/Selector: Custom prev / next button. Must be two jQuery elements. In order to make the events work they have to have the classes "prev" and "next" (plus namespace)
    sync: "",                       //{NEW} Selector: Mirror the actions performed on this slider with another slider. Use with care.
    asNavFor: "",                   //{NEW} Selector: Internal property exposed for turning the slider into a thumbnail navigation for another slider

    // Carousel Options
    itemWidth: 0,                   //{NEW} Integer: Box-model width of individual carousel items, including horizontal borders and padding.
    itemMargin: 0,                  //{NEW} Integer: Margin between carousel items.
    minItems: 1,                    //{NEW} Integer: Minimum number of carousel items that should be visible. Items will resize fluidly when below this.
    maxItems: 0,                    //{NEW} Integer: Maxmimum number of carousel items that should be visible. Items will resize fluidly when above this limit.
    move: 0,                        //{NEW} Integer: Number of carousel items that should move on animation. If 0, slider will move all visible items.
    allowOneSlide: true,           //{NEW} Boolean: Whether or not to allow a slider comprised of a single slide

    // Callback API
    start: function(){},            //Callback: function(slider) - Fires when the slider loads the first slide
    before: function(){},           //Callback: function(slider) - Fires asynchronously with each slider animation
    after: function(){},            //Callback: function(slider) - Fires after each slider animation completes
    end: function(){},              //Callback: function(slider) - Fires when the slider reaches the last slide (asynchronous)
    added: function(){},            //{NEW} Callback: function(slider) - Fires after a slide is added
    removed: function(){},           //{NEW} Callback: function(slider) - Fires after a slide is removed
    init: function() {}             //{NEW} Callback: function(slider) - Fires after the slider is initially setup
  };

  //FlexSlider: Plugin Function
  $.fn.flexslider = function(options) {
    if (options === undefined) { options = {}; }

    if (typeof options === "object") {
      return this.each(function() {
        var $this = $(this),
            selector = (options.selector) ? options.selector : ".slides > li",
            $slides = $this.find(selector);

      if ( ( $slides.length === 1 && options.allowOneSlide === true ) || $slides.length === 0 ) {
          $slides.fadeIn(400);
          if (options.start) { options.start($this); }
        } else if ($this.data('flexslider') === undefined) {
          new $.flexslider(this, options);
        }
      });
    } else {
      // Helper strings to quickly perform functions on the slider
      var $slider = $(this).data('flexslider');
      switch (options) {
        case "play": $slider.play(); break;
        case "pause": $slider.pause(); break;
        case "stop": $slider.stop(); break;
        case "next": $slider.flexAnimate($slider.getTarget("next"), true); break;
        case "prev":
        case "previous": $slider.flexAnimate($slider.getTarget("prev"), true); break;
        default: if (typeof options === "number") { $slider.flexAnimate(options, true); }
      }
    }
  };
})(jQuery);

define("flexslider", function(){});

define('modules/library/views/detail_image',[
    'app'
    , 'text!modules/library/templates/detail_image.html'
    , 'flexslider'
],function(
    app
    , template
){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            $('#image-slider').flexslider({
                animation: "slide",
                smoothHeight: true
            });
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});

define('text!modules/library/templates/detail_document.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li class="active"><%-data_info.content.title%></li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="document">\r\n    <div class="container">\r\n        <div class="reader" id="reader"></div>\r\n        <% if(related_data){ %>\r\n        <div class="page-doc-list">\r\n                <ul class="item-list">\r\n                    <% _.each(related_data, function(res, index){%>\r\n                    <li>\r\n                        <div class="title">《<%=res.content.title%>》</div>\r\n                        <div class="opts">\r\n                            <a href="#!/detail/<%=res.id%>/">阅读</a>\r\n                            <a href="<%=res.content.file.url_path%>">下载</a>\r\n                        </div>\r\n                    </li>\r\n                    <% }); %>\r\n                </ul>\r\n        </div>\r\n        <% } %>\r\n\r\n    </div>\r\n</div>\r\n';});

define('modules/library/views/detail_document',[
    'app'
    , 'text!modules/library/templates/detail_document.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            var self = this;
            this.options = options || {};
            this.type = this.model.get('data_info').content.file.type;
            this.html = null;
            $.get(this.model.get('data_info').content.file.url_path, function(html){
                self.html = html;
                self.render();
            },'html');
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
//            $.get(this.model.get('data_info').content.file.url_path, function(data){
//                if(self.type == 'doc' || self.type == 'docx'){
//                    data = data.replace('<body', '<body><div class="page"').replace('</body>','</div></body>');
//                }
//                self.$('#viewer .container').html($(data).filter('.page'));
//            },'html');
            this.buildReader();

            return this;
        }
        , buildReader: function(){
            var self = this;
            if(this.type == 'doc' || this.type == 'docx'){
                var page = $('<div class="page"></div>');
                this.$('#reader').append(page);
                _.each($(this.html),function(el){
                    if(el.tagName == 'META' || el.tagName == 'TITLE' || el.tagName == 'LINK' || el.tagName == 'STYLE') return true;
                    if(page.height() > 800){
                        self.$('#reader').append('<div class="page"></div>');
                        page = self.$('#reader .page:last');
                    }
                    page.append(el);
                });
            }else if(this.type = 'pdf'){
                this.$('#reader').html($(this.html).filter('.page'));
            }
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});
define('modules/library/models/stat',[
    'app'
],function(
    app
    ){
    
    var Model = Backbone.Model.extend({
        defaults: {
            library_id: '',
            hit_count: '',
            week_hit_count: '',
            month_hit_count: '',
            lib_name: '',
            cate_stat: []
        }
        , idAttribute: "library_id"
        , initialize: function(attrs, options){
        }
    });
    return Model;
});
define('modules/library/collections/stats',[
    'app'
    , 'modules/library/models/stat'
],function(
    app
    , Stat
    ){
    
    var Collection = Backbone.Model.extend({
        model: Stat
        , initialize: function(attrs, options){
        }
        , url: app.api + '/stat/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg.stat_list;
            }else{
                return response;
            }
        }
    });
    return Collection;
});

define('text!modules/library/templates/stat.html',[],function () { return '<div id="breadcrumb">\r\n    <div class="container">\r\n        <ol class="breadcrumb">\r\n            <li><a href="#!/">首页</a></li>\r\n            <li class="active">访问统计</li>\r\n        </ol>\r\n    </div>\r\n</div>\r\n<div id="category">\r\n    <div class="container">\r\n        <h1>访问统计</h1>\r\n        <table class="table">\r\n            <thead>\r\n                <tr>\r\n                    <th>库/栏目名称</th>\r\n                    <th>周点击</th>\r\n                    <th>月点击</th>\r\n                    <th>总点击</th>\r\n                </tr>\r\n            </thead>\r\n            <tbody>\r\n                <% _.each(stats, function(stat){ %>\r\n                    <tr>\r\n                        <td><a href="#!/"><%-stat.lib_name%></a></td>\r\n                        <td><%-stat.week_hit_count%></td>\r\n                        <td><%-stat.month_hit_count%></td>\r\n                        <td><%-stat.hit_count%></td>\r\n                    </tr>\r\n                    <% if(stat.cate_stat){ %>\r\n                        <% _.each(stat.cate_stat, function(st){ %>\r\n                        <tr>\r\n                            <td><a href="#!/category/<%-st.category_id%>"><%-st.cate_name%></a></td>\r\n                            <td><%-st.week_hit_count%></td>\r\n                            <td><%-st.month_hit_count%></td>\r\n                            <td><%-st.hit_count%></td>\r\n                        </tr>\r\n                        <% }) %>\r\n                    <% } %>\r\n                <% }) %>\r\n            </tbody>\r\n        </table>\r\n    </div>\r\n</div>\r\n';});

define('modules/library/views/stat',[
    'app'
    , 'text!modules/library/templates/stat.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: "访问统计"
        , events: {}
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({
                stats: this.collection.toJSON()
            }));
            return this;
        }
    });
    return View;
});

define('text!modules/library/templates/signin.html',[],function () { return '<div id="login">\r\n    <div class="container">\r\n        <div class="login-panel">\r\n            <form action="/user/login" method="post" class="form-horizontal">\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">用户名</label>\r\n                    <div class="col-xs-9">\r\n                        <input class="form-control" type="text" name="username" placeholder="请输入用户名"/>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">密码</label>\r\n                    <div class="col-xs-9">\r\n                        <input class="form-control" type="password" name="password" placeholder="请输入密码"/>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">验证码</label>\r\n                    <div class="col-xs-9">\r\n                        <div class="input-group">\r\n                            <input class="form-control" type="text" name="captcha" placeholder="请输入右侧验证码"/>\r\n                            <span class="input-group-addon" style="padding-top: 5px; padding-bottom: 5px;"><img src="/user/captcha" alt="点击换一个" onclick="this.src = \'/user/captcha?_=\'+(new Date).getTime()"/></span>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <div class="col-xs-9 col-xs-offset-3">\r\n                        <input class="btn btn-primary btn-lg btn-block" type="submit" data-loading-text="登录中…" value="登录"/>\r\n                    </div>\r\n                </div>\r\n            </form>\r\n        </div>\r\n    </div>\r\n</div>';});

define('modules/library/views/signin',[
    'app'
    , 'text!modules/library/templates/signin.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        title: '登录'
        , template: _.template(template)
        , events: {
            'click :submit': 'submit'
        }
        , initialize: function(){
        }
        , render: function(){
            this.$el.html(this.template());
            return this;
        }
        , submit: function(e){
            e.preventDefault();
            var form = this.$('form'),
                btn = form.find(':submit');
            btn.button('loading');
            $.post(form.attr('action'), form.serialize(), function(json){
                btn.button('reset');
                if(json.code == 0){
                    location.href = '/';
                }else{
                    alert(json.msg);
                }
            }, 'json');
        }
    });
    return View;
});

define('text!modules/library/templates/signup.html',[],function () { return '<div id="login">\r\n    <div class="container">\r\n        <div class="login-panel">\r\n            <form action="/user/signup" method="post" class="form-horizontal">\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">用户名</label>\r\n                    <div class="col-xs-9">\r\n                        <input class="form-control" type="text" name="username" placeholder="请输入用户名"/>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">密码</label>\r\n                    <div class="col-xs-9">\r\n                        <input class="form-control" type="password" name="password" placeholder="请输入密码"/>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">重复密码</label>\r\n                    <div class="col-xs-9">\r\n                        <input class="form-control" type="password" name="repassword" placeholder="请再次输入以上密码"/>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <label class="control-label col-xs-3">验证码</label>\r\n                    <div class="col-xs-9">\r\n                        <div class="input-group">\r\n                            <input class="form-control" type="text" name="captcha" placeholder="请输入右侧验证码"/>\r\n                            <span class="input-group-addon" style="padding-top: 5px; padding-bottom: 5px;"><img src="/user/captcha" alt="点击换一个" onclick="this.src = \'/user/captcha?_=\'+(new Date).getTime()"/></span>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n                <div class="form-group">\r\n                    <div class="col-xs-9 col-xs-offset-3">\r\n                        <input class="btn btn-primary btn-lg btn-block" type="submit" data-loading-text="注册中…" value="注册"/>\r\n                    </div>\r\n                </div>\r\n            </form>\r\n        </div>\r\n    </div>\r\n</div>';});

define('modules/library/views/signup',[
    'app'
    , 'text!modules/library/templates/signup.html'
],function(
    app
    , template
    ){
    
    var View = Backbone.View.extend({
        title: '注册'
        , template: _.template(template)
        , events: {
            'click :submit': 'submit'
        }
        , initialize: function(){
        }
        , render: function(){
            this.$el.html(this.template());
            return this;
        }
        , submit: function(e){
            e.preventDefault();
            var form = this.$('form'),
                btn = form.find(':submit');
            btn.button('loading');
            $.post(form.attr('action'), form.serialize(), function(json){
                btn.button('reset');
                if(json.code == 0){
                    location.href = '#!/signin/';
                }else{
                    alert(json.msg);
                }
            }, 'json');
        }
    });
    return View;
});
define('router',[
        'app'
        , 'modules/layout/views/default'
        , 'modules/layout/views/search'
        , 'modules/library/models/index'
        , 'modules/library/views/index'
        , 'modules/library/models/library'
        , 'modules/library/views/library'
        , 'modules/library/models/category'
        , 'modules/library/views/category'
        , 'modules/library/collections/results'
        , 'modules/library/views/search'
        , 'modules/library/models/resource'
        , 'modules/library/views/resource'
        , 'modules/library/models/detail'
        , 'modules/library/views/detail_video'
        , 'modules/library/views/detail_music'
        , 'modules/library/views/detail_image'
        , 'modules/library/views/detail_document'
        , 'modules/library/collections/stats'
        , 'modules/library/views/stat'
        , 'modules/library/views/signin'
        , 'modules/library/views/signup'
    ],
    function(
        app
        , defaultLayoutView
        , searchLayoutView
        , Index
        , indexView
        , Library
        , libraryView
        , Category
        , categoryView
        , Results
        , searchView
        , Resource
        , resourceView
        , Detail
        , detailVideoView
        , detailMusicView
        , detailImageView
        , detailDocumentView
        , Stats
        , statView
        , signinView
        , signupView
        ) {
        
        var Router = Backbone.Router.extend({
            routes: {
                '':                               'defaultAction'
                , '!/':                            'defaultAction'
                , '!/index(/)':                     'index'
                , '!/library(/)':                   'library'
                , '!/category/:id(/:page)(/)':            'category'
                , '!/resource/:id(/)':                       'resource'
                , '!/detail/:id(/)':                       'detail'
                , '!/search/:keyword(/:page)(/)':        'search'
                , '!/stat(/)':                          'stat'
                , '!/signin(/)':                       'signin'
                , '!/signup(/)':                       'signup'
            }
            /*
            index 总平台
            library 服务平台
            category 分类
            resource 课程
            detail  视频
            */
            , 'initialize': function(options){
                this.options = options || {};
                Backbone.history.start({hashChange: true, root: app.root});
            }
            , 'defaultAction': function(actions){
                this.navigate('!/library/', {trigger: true});
            }
            , 'index': function(){
                var _this = this;
                var model = new Index();
                model.fetch({
                    success: function(model, res){
                        //success:(model, response, options)
                        $.getJSON('/totalindex/siteinfo', function(json){
                            var index = new indexView({model: model, site: json.pkg});
                            _this.view && _this.view.remove();
                            _this.view = index;
                            $('body').scrollTop(0).html(index.el);
                            index.render();
                        });
                    }
                });
            }
            , 'library': function(){
                var _this = this;
                var model = new Library();
                model.fetch({
                    success: function(model, res){
                        _this.loadView(new libraryView({model: model}));
                    }
                });
            }
            , 'category': function(id, page){
                var _this = this;
                var model = new Category();
                page = page || 1;
                model.fetch({
                    data: {
                        category_id: id,
                        page: page
                    }
                    , success: function(model, res){
                        _this.loadView(new categoryView({model: model, cid: id, page: page}));
                    }
                });
            }
            , 'search': function(keyword, page){
                var _this = this;
                var collection = new Results();
                page = page || 1;
                collection.fetch({
                    data: {
                        keyword: keyword,
                        page: page
                    }
                    , success: function(collection, res){
                        _this.loadSearchView(new searchView({collection: collection, keyword: keyword, page: page}));
                    }
                });
            }
            , 'resource': function(id){
                var _this = this;
                var model = new Resource();
                model.fetch({
                    data: {
                        resource_id: id
                    }
                    , success: function(model, res){
                        _this.loadView(new resourceView({model: model}));
                    }
                });
            }
            , 'detail': function(id){
                var _this = this;
                var model = new Detail();
                model.fetch({
                    data: {
                        id: id
                    }
                    , success: function(model, res){
                        if(res.code == 0){
                            var type = model.get('data_info').resource_type;
                            //img,doc,video,music
                            if(type == 'video'){
                                _this.loadView(new detailVideoView({model: model}));
                            }else if(type == 'music'){
                                _this.loadView(new detailMusicView({model: model}));
                            }else if(type == 'img'){
                                _this.loadView(new detailImageView({model: model}));
                            }else{
                                _this.loadView(new detailDocumentView({model: model}));
                            }
                        }else{
                            alert(res.msg);
                            _this.navigate('!/', {trigger: true});
                        }
                    }
                });
            }
            , 'stat': function(id){
                var _this = this;
                var collection = new Stats();
                collection.fetch({
                    success: function(collection, res){
                        _this.loadView(new statView({collection: collection}));
                    }
                });
            }

            , 'signin': function(){
                this.loadView(new signinView());
            }
            , 'signup': function(){
                this.loadView(new signupView());
            }
            , 'loadView': function(page){
                app.setTitle(_.result(page, 'title'));
                //_.result(object, property, [defaultValue]) 
                this.view && this.view.remove();
                this.view = page;
                this.layout && this.layout.remove();
                this.layout = new defaultLayoutView({model: app.site, page: this.view});
                this.layout.$("#container").html(this.view.el);
                $('body').scrollTop(0).html(this.layout.el);
                this.view.render();
            }
            , 'loadSearchView': function(page){
                app.setTitle(_.result(page, 'title'));
                this.view && this.view.remove();
                this.view = page;
                this.layout && this.layout.remove();
                this.layout = new searchLayoutView({model: app.site, page: this.view});
                this.layout.$("#container").html(this.view.el);
                $('body').scrollTop(0).html(this.layout.el);
                this.view.render();
            }
        });
        return Router;
    });
require([
    'app'
    , 'modules/library/models/site'
    , 'router'
], function(
    app
    , Site
    , Router
    ){
    
    app.initialize();
    app.site = new Site();
    $.when(
        app.site.fetch({silent: true})
    ).always(function(){
        if(app.site.get('themes')){
            $('link#themes').attr('href','/assets/stylesheets/'+app.site.get('themes'));
        }
        var router = new Router();
    });
});
define("main", function(){});

