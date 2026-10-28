//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*! 
 * SmlDocCatsInfraStructureExtensions.js --- Cats.Infrastructure.Extensions documentation data for the SML docs browser
 *                   copied into the new SML docs data namespace
 * Public Domain
 * Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Per hoc, facies, scietis quod ille miserit me ut facerem universa quae cernitis et factis: Non est mecum!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 12/01/2025
 */
"use strict";
export default class SmlDocCatsInfraStructureExtensions  {

    constructor() {
    }
    static getNamespace(){
        const docs = {
            name: "CatsInfrastructureExtensions",
            namespace: "Cats.Infrastructure.Extensions",
            description: "The Cats.Infrastructure.Extensions namespace contains the extension-method groups used by reporting, security, string handling, and related infrastructure helpers.",
            classes: [
                { name: "CCReportCoreExtensions", path: "/src/Infrastructure/Extensions/CCReportCoreExtensions.cs" },
                { name: "CCReportProjectionExtensions", path: "/src/Infrastructure/Extensions/CCReportProjectionExtensions.cs" },
                { name: "CCReportSearchExtensions", path: "/src/Infrastructure/Extensions/CCReportSearchExtensions.cs" },
                { name: "CCReportSerializationExtensions", path: "/src/Infrastructure/Extensions/CCReportSerializationExtensions.cs" },
                { name: "AppSecurityExtensions", path: "/src/Infrastructure/AppSecurityExtensions.cs" },
                { name: "StringExtensions", path: "/src/Infrastructure/StringExtensions.cs" }
            ]
        };
        return docs;
    }

         /**
         * Returns structured documentation for the AppSecurityExtensions class (C# extension methods)
         * @returns {Object} Documentation metadata and description
         */
        static AppSecurityExtensions() {
            return {
                class: "AppSecurityExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "AppSecurityExtensions.cs",
                sourceUrl: "/src/Infrastructure/AppSecurityExtensions.cs",
                description: "Provides extension methods for application security, including claims, roles, and authentication helpers for ASP.NET Core applications.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2025",
                language: "C#",
                methods: [
                    {
                        name: "GetUserRoles",
                        description: "Retrieves all roles assigned to the current user from claims.",
                        params: [
                            { name: "ClaimsPrincipal user", description: "The user principal to extract roles from." }
                        ],
                        returns: "IEnumerable<string> (list of role names)",
                        example: "var roles = user.GetUserRoles();"
                    },
                    {
                        name: "HasRole",
                        description: "Checks if the user has a specific role.",
                        params: [
                            { name: "ClaimsPrincipal user", description: "The user principal." },
                            { name: "string role", description: "The role to check for." }
                        ],
                        returns: "bool (true if user has role)",
                        example: "if (user.HasRole(\"Admin\")) { ... }"
                    },
                    {
                        name: "GetClaimValue",
                        description: "Gets the value of a specific claim type for the user.",
                        params: [
                            { name: "ClaimsPrincipal user", description: "The user principal." },
                            { name: "string claimType", description: "The claim type to retrieve." }
                        ],
                        returns: "string (claim value or null)",
                        example: "var email = user.GetClaimValue(ClaimTypes.Email);"
                    },
                    {
                        name: "IsAuthenticated",
                        description: "Checks if the user is authenticated.",
                        params: [
                            { name: "ClaimsPrincipal user", description: "The user principal." }
                        ],
                        returns: "bool (true if authenticated)",
                        example: "if (user.IsAuthenticated()) { ... }"
                    }
                ],
                notes: [
                    "Extension methods are static and must be called on ClaimsPrincipal objects.",
                    "Designed for use in ASP.NET Core controllers, middleware, and Razor pages.",
                    "Methods simplify role and claim management for authentication and authorization workflows."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "var roles = User.GetUserRoles();",
                    "if (User.HasRole(\"Admin\")) { /* ... */ }"
                ]
            };
        }
        /**
         * Returns structured documentation for the StringExtensions class (C# extension methods)
         * @returns {Object} Documentation metadata and description
         */
        static StringExtensions() {
            return {
                class: "StringExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "StringExtensions.cs",
                sourceUrl: "/src/Infrastructure/StringExtensions.cs",
                description: "Provides extension methods for string manipulation, formatting, validation, and conversion in C# applications.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2025",
                language: "C#",
                methods: [
                    {
                        name: "IsNullOrEmpty",
                        description: "Checks whether a string is null or empty.",
                        params: [ { name: "string value", description: "The string to check." } ],
                        returns: "bool",
                        example: "if (str.IsNullOrEmpty()) { ... }"
                    },
                    {
                        name: "IsEmpty",
                        description: "Checks whether a string is null or empty.",
                        params: [ { name: "string value", description: "The string to check." } ],
                        returns: "bool",
                        example: "if (str.IsEmpty()) { ... }"
                    },
                    {
                        name: "AllIndexesOf",
                        description: "Returns all indices of a substring in a string.",
                        params: [ { name: "string str", description: "The string to search." }, { name: "string value", description: "The substring to find." } ],
                        returns: "List<int>",
                        example: "var indexes = str.AllIndexesOf('cat');"
                    },
                    {
                        name: "BreakCamelNotation",
                        description: "Spaces out each capital letter in Camel/Pascal notation.",
                        params: [ { name: "string str", description: "The string to break." } ],
                        returns: "string",
                        example: "var spaced = str.BreakCamelNotation();"
                    },
                    {
                        name: "Clip",
                        description: "Clips a string to a given maximum length.",
                        params: [ { name: "string str", description: "The string to clip." }, { name: "int maxLength", description: "Maximum length." } ],
                        returns: "string",
                        example: "var clipped = str.Clip(10);"
                    },
                    {
                        name: "Echo",
                        description: "Repeats the string a specified number of times.",
                        params: [ { name: "string str", description: "The string to repeat." }, { name: "int numberOfTimes", description: "Number of repetitions." } ],
                        returns: "string",
                        example: "var repeated = str.Echo(3);"
                    },
                    {
                        name: "RemoveHtmlTags",
                        description: "Removes HTML tags from a string.",
                        params: [ { name: "string str", description: "The string to clean." }, { name: "bool lineBreakChunks", description: "Add line breaks between chunks." }, { name: "bool reduceWhitespace", description: "Reduce whitespace." } ],
                        returns: "string",
                        example: "var clean = str.RemoveHtmlTags();"
                    },
                    {
                        name: "RemoveSpecialCharacters",
                        description: "Removes all special characters from a string, leaving only letters and numerals.",
                        params: [ { name: "string str", description: "The string to clean." }, { name: "bool allowSpaces", description: "Allow spaces." } ],
                        returns: "string",
                        example: "var clean = str.RemoveSpecialCharacters();"
                    },
                    {
                        name: "ReplaceFirst",
                        description: "Replaces the first occurrence of a substring.",
                        params: [ { name: "string str", description: "The string to modify." }, { name: "string find", description: "Substring to find." }, { name: "string replace", description: "Replacement string." } ],
                        returns: "string",
                        example: "var result = str.ReplaceFirst('cat', 'dog');"
                    },
                    {
                        name: "ReplaceLast",
                        description: "Replaces the last occurrence of a substring.",
                        params: [ { name: "string str", description: "The string to modify." }, { name: "string find", description: "Substring to find." }, { name: "string replace", description: "Replacement string." } ],
                        returns: "string",
                        example: "var result = str.ReplaceLast('cat', 'dog');"
                    },
                    {
                        name: "TextBetween",
                        description: "Returns the text between two substrings.",
                        params: [ { name: "string str", description: "The string to search." }, { name: "string firstFind", description: "First delimiter." }, { name: "string secondFind", description: "Second delimiter." } ],
                        returns: "string",
                        example: "var between = str.TextBetween('(', ')');"
                    },
                    {
                        name: "ToPascalCase",
                        description: "Converts a string to PascalCase.",
                        params: [ { name: "string str", description: "The string to convert." }, { name: "bool stripUnderscores", description: "Treat underscores as delimiters." } ],
                        returns: "string",
                        example: "var pascal = str.ToPascalCase();"
                    },
                    {
                        name: "ToCamelCase",
                        description: "Converts a string to camelCase.",
                        params: [ { name: "string str", description: "The string to convert." } ],
                        returns: "string",
                        example: "var camel = str.ToCamelCase();"
                    },
                    {
                        name: "ToTitleCase",
                        description: "Converts a string to Title Case.",
                        params: [ { name: "string str", description: "The string to convert." } ],
                        returns: "string",
                        example: "var title = str.ToTitleCase();"
                    },
                    {
                        name: "ToPhoneFormat",
                        description: "Formats a string as a phone number.",
                        params: [ { name: "string str", description: "The string to format." }, { name: "bool toNumbersOnly", description: "Return only numbers." }, { name: "bool parensStyle", description: "Use parentheses style." }, { name: "string format", description: "Custom format." } ],
                        returns: "string",
                        example: "var phone = str.ToPhoneFormat();"
                    },
                    {
                        name: "NotEmpty",
                        description: "Checks if a string is not null, empty, or whitespace.",
                        params: [ { name: "string str", description: "The string to check." } ],
                        returns: "bool",
                        example: "if (str.NotEmpty()) { ... }"
                    },
                    {
                        name: "AsList",
                        description: "Splits a string into a list of strings.",
                        params: [ { name: "string str", description: "The string to split." }, { name: "string delimiter", description: "Delimiter." }, { name: "bool removeEmpty", description: "Remove empty entries." }, { name: "bool alphabetize", description: "Sort alphabetically." }, { name: "bool getDistinctOnly", description: "Return distinct values only." }, { name: "int? expectedCount", description: "Expected number of items." }, { name: "string defaultEmpty", description: "Default value for empty items." } ],
                        returns: "List<string>",
                        example: "var list = str.AsList(',');"
                    },
                    {
                        name: "AsSelectList",
                        description: "Turns a delimited string into a SelectList.",
                        params: [ { name: "string str", description: "The string to split." }, { name: "string delimiter", description: "Delimiter." }, { name: "int? expectedCount", description: "Expected number of items." }, { name: "string defaultEmpty", description: "Default value for empty items." }, { name: "string selected", description: "Selected value." } ],
                        returns: "SelectList",
                        example: "var selectList = str.AsSelectList(',');"
                    },
                    {
                        name: "GetObjectTypeFromName",
                        description: "Gets the object type from its name.",
                        params: [ { name: "string str", description: "Type name." } ],
                        returns: "Type",
                        example: "var type = str.GetObjectTypeFromName();"
                    },
                    {
                        name: "GetObjectInstanceFromName",
                        description: "Gets the object type instance from its name.",
                        params: [ { name: "string str", description: "Type name." } ],
                        returns: "T",
                        example: "var instance = str.GetObjectInstanceFromName<MyType>();"
                    },
                    {
                        name: "AlterEncapse",
                        description: "Alters encapsulation characters in a JSON string.",
                        params: [ { name: "string str", description: "JSON string." }, { name: "string encapseOne", description: "Character to replace." }, { name: "string encapseOneReplace", description: "Replacement character." }, { name: "string encapseTwo", description: "Second character to replace." }, { name: "string encapseTwoReplace", description: "Second replacement character." } ],
                        returns: "string",
                        example: "var altered = str.AlterEncapse();"
                    },
                    {
                        name: "UnAlterEncapse",
                        description: "Reverts altered encapsulation characters in a JSON string.",
                        params: [ { name: "string str", description: "Altered JSON string." }, { name: "string encapseOne", description: "Character to revert." }, { name: "string encapseOneReplace", description: "Replacement character." }, { name: "string encapseTwo", description: "Second character to revert." }, { name: "string encapseTwoReplace", description: "Second replacement character." } ],
                        returns: "string",
                        example: "var unaltered = str.UnAlterEncapse();"
                    },
                    {
                        name: "FormDataToJSON",
                        description: "Converts WebKitFormBoundary form data into JSON.",
                        params: [ { name: "string str", description: "Form data string." } ],
                        returns: "string",
                        example: "var json = str.FormDataToJSON();"
                    },
                    {
                        name: "ExtractJsonFromFormData",
                        description: "Extracts JSON from WebKitFormBoundary form data.",
                        params: [ { name: "string formData", description: "Form data string." }, { name: "string delimPart", description: "Boundary delimiter." } ],
                        returns: "string",
                        example: "var json = str.ExtractJsonFromFormData();"
                    },
                    {
                        name: "ExtractJsonFromFormData2",
                        description: "Alternative method to extract JSON from form data.",
                        params: [ { name: "string formData", description: "Form data string." }, { name: "string delimPart", description: "Boundary delimiter." } ],
                        returns: "string",
                        example: "var json = str.ExtractJsonFromFormData2();"
                    },
                    {
                        name: "GenerateDisplayName",
                        description: "Generates a display name from a property string.",
                        params: [ { name: "string str", description: "Property string." } ],
                        returns: "string",
                        example: "var displayName = str.GenerateDisplayName();"
                    },
                    {
                        name: "ComputeHash",
                        description: "Computes the hash of the string using a specified hash algorithm.",
                        params: [ { name: "string str", description: "String to hash." }, { name: "eHashType hashType", description: "Hash algorithm." } ],
                        returns: "string",
                        example: "var hash = str.ComputeHash();"
                    },
                    {
                        name: "Decrypt",
                        description: "Decrypts a string using the supplied key (RSA).",
                        params: [ { name: "string str", description: "String to decrypt." }, { name: "string key", description: "Decryption key." } ],
                        returns: "string",
                        example: "var decrypted = str.Decrypt('key');"
                    },
                    {
                        name: "Encrypt",
                        description: "Encrypts a string using the supplied key (RSA).",
                        params: [ { name: "string str", description: "String to encrypt." }, { name: "string key", description: "Encryption key." } ],
                        returns: "string",
                        example: "var encrypted = str.Encrypt('key');"
                    },
                    {
                        name: "FoilJsHtmlJsEvents",
                        description: "Strips HTML event tags from the string.",
                        params: [ { name: "string str", description: "String to clean." } ],
                        returns: "string",
                        example: "var clean = str.FoilJsHtmlJsEvents();"
                    },
                    {
                        name: "FoilXssData",
                        description: "Strips XSS data from a string using RegEx.",
                        params: [ { name: "string str", description: "String to clean." } ],
                        returns: "string",
                        example: "var clean = str.FoilXssData();"
                    },
                    {
                        name: "SplitBy",
                        description: "Breaks a string into chunks of specified length.",
                        params: [ { name: "string str", description: "String to split." }, { name: "int chunkLength", description: "Chunk length." } ],
                        returns: "IEnumerable<string>",
                        example: "var chunks = str.SplitBy(10);"
                    },
                    {
                        name: "HasXssData",
                        description: "Checks if a string contains XSS data via RegEx.",
                        params: [ { name: "string str", description: "String to check." } ],
                        returns: "bool",
                        example: "if (str.HasXssData()) { ... }"
                    }
                ],
                notes: [
                    "Extension methods are static and must be called on string objects.",
                    "Designed for use in ASP.NET Core, utility libraries, and Razor pages.",
                    "Methods simplify string manipulation, validation, and conversion workflows."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "if (myString.NotEmpty()) { /* ... */ }",
                    "var list = myString.AsList(',');"
                ]
            };
        }

        /**
         * Returns structured documentation for the CCReport core extension file.
         * @returns {Object} Documentation metadata and description
         */
        static CCReportCoreExtensions() {
            return {
                class: "CCReportCoreExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "CCReportCoreExtensions.cs",
                sourceUrl: "/src/Infrastructure/Extensions/CCReportCoreExtensions.cs",
                description: "Provides the core report setup helpers that copy client settings into a report, read report messages, choose field types, and check whether a report has filters.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2026",
                language: "C#",
                methods: [
                    {
                        name: "Init",
                        description: "Copies client report settings into the server report and fills in missing defaults.",
                        params: [
                            { name: "CCReport<M> report", description: "The server-side report being updated." },
                            { name: "CCReport<M> contextReport", description: "The client-side report settings." }
                        ],
                        returns: "void"
                    },
                    {
                        name: "InitDTO",
                        description: "Copies client DTO report settings into the server report and fills in missing defaults.",
                        params: [
                            { name: "CCReport<DTO> report", description: "The server-side report being updated." },
                            { name: "CCReport<DTO> contextReport", description: "The client-side report settings." }
                        ],
                        returns: "void"
                    },
                    {
                        name: "GetMessageValue",
                        description: "Reads one message value from a report by message name.",
                        params: [
                            { name: "CCReport<M> table", description: "The report that holds the messages." },
                            { name: "string name", description: "The message name or text to look for." },
                            { name: "string field", description: "Which message field to return." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "MessageToObject",
                        description: "Builds a model object from the report messages.",
                        params: [
                            { name: "CCReport<M> table", description: "The report that holds the messages." }
                        ],
                        returns: "M"
                    },
                    {
                        name: "MessageToDTO",
                        description: "Builds a DTO object from the report messages.",
                        params: [
                            { name: "CCReport<DTO> table", description: "The report that holds the messages." }
                        ],
                        returns: "DTO"
                    },
                    {
                        name: "GetDTOMessageValue",
                        description: "Reads one DTO message value from a report by message name.",
                        params: [
                            { name: "CCReport<DTO> table", description: "The report that holds the messages." },
                            { name: "string name", description: "The message name or text to look for." },
                            { name: "string field", description: "Which message field to return." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "getFieldType",
                        description: "Chooses the UI input type for a property.",
                        params: [
                            { name: "PropertyInfoDTO prop", description: "The property metadata to inspect." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "ReportHasFiltering",
                        description: "Returns true when the report has at least one basic filter value.",
                        params: [
                            { name: "CCReport<M> report", description: "The report to inspect." }
                        ],
                        returns: "bool"
                    },
                    {
                        name: "ReportHasAdvancedFiltering",
                        description: "Returns true when the report has at least one advanced filter value or nested filter group.",
                        params: [
                            { name: "CCReport<M> report", description: "The report to inspect." }
                        ],
                        returns: "bool"
                    }
                ],
                notes: [
                    "This file handles the shared report setup work that every report path uses first.",
                    "The helper methods keep the report object consistent before search, projection, or save logic runs.",
                    "Message helpers turn report message traffic into model or DTO data when the caller needs it."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "report.Init(contextReport);",
                    "var hasFilters = report.ReportHasFiltering();"
                ]
            };
        }

        /**
         * Returns structured documentation for the CCReport projection extension file.
         * @returns {Object} Documentation metadata and description
         */
        static CCReportProjectionExtensions() {
            return {
                class: "CCReportProjectionExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "CCReportProjectionExtensions.cs",
                sourceUrl: "/src/Infrastructure/Extensions/CCReportProjectionExtensions.cs",
                description: "Provides the projection helpers that copy filter values into model or DTO objects, build column lists, and shape report data for forms and table output.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2026",
                language: "C#",
                methods: [
                    {
                        name: "FillFromCCReportM",
                        description: "Copies simple filter values from a report into a model object.",
                        params: [
                            { name: "CCReport<M> rpt", description: "The report containing the filters." }
                        ],
                        returns: "M"
                    },
                    {
                        name: "FillFromCCReportDTO",
                        description: "Copies simple filter values from a report into a DTO object.",
                        params: [
                            { name: "CCReport<DTO> rpt", description: "The report containing the filters." }
                        ],
                        returns: "DTO"
                    },
                    {
                        name: "ColumnsDown",
                        description: "Builds the comma-separated column list that should be sent to the client.",
                        params: [
                            { name: "CCReport<SM> rpt", description: "The report whose columns should be exported." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "ColumnsDownDTO",
                        description: "Builds the comma-separated column list for a DTO report.",
                        params: [
                            { name: "CCReport<DTO> rpt", description: "The report whose columns should be exported." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "ToTableConfigJson",
                        description: "Turns a model list and report config into table-config JSON.",
                        params: [
                            { name: "List<M> list", description: "The data rows to serialize." },
                            { name: "CCReport<M> cfg", description: "The report configuration to include." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "ToFormData",
                        description: "Builds form data for a model record using the report setup.",
                        params: [
                            { name: "CCQueryForm qForm", description: "The query form to populate." },
                            { name: "CCReport<DTO> rpt", description: "The report that defines the form." },
                            { name: "M dataIn", description: "The model record providing field values." }
                        ],
                        returns: "CCQueryForm"
                    },
                    {
                        name: "ToFormDataDTO",
                        description: "Builds form data for a DTO record using the report setup.",
                        params: [
                            { name: "CCQueryForm qForm", description: "The query form to populate." },
                            { name: "CCReport<DTO> rpt", description: "The report that defines the form." },
                            { name: "DTO dataIn", description: "The DTO record providing field values." }
                        ],
                        returns: "CCQueryForm"
                    }
                ],
                notes: [
                    "This file prepares report data before it is sent to the browser or a form builder.",
                    "It also keeps hidden and additional fields aligned with the report configuration.",
                    "The helper methods are mostly about moving data into the shape the UI expects."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "var formData = qForm.ToFormData(report, model);",
                    "var columns = report.ColumnsDown();"
                ]
            };
        }

        /**
         * Returns structured documentation for the CCReport search extension file.
         * @returns {Object} Documentation metadata and description
         */
        static CCReportSearchExtensions() {
            return {
                class: "CCReportSearchExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "CCReportSearchExtensions.cs",
                sourceUrl: "/src/Infrastructure/Extensions/CCReportSearchExtensions.cs",
                description: "Provides the search helpers that turn quick search, simple filters, advanced filters, and individual operators into expression trees.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2026",
                language: "C#",
                methods: [
                    { name: "QuickSearchM", description: "Builds a quick text search expression for a model report.", params: [{ name: "CCReport<M> rpt", description: "The report containing the quick search text." }], returns: "Expression<Func<M, bool>>" },
                    { name: "QuickSearchDTO", description: "Builds a quick text search expression for a DTO report.", params: [{ name: "CCReport<DTO> rpt", description: "The report containing the quick search text." }], returns: "Expression<Func<DTO, bool>>" },
                    { name: "SimpleSearchDTO", description: "Builds the simple filter expression for a DTO report.", params: [{ name: "CCReport<M> rpt", description: "The report containing the basic filters." }], returns: "Expression<Func<M, bool>>" },
                    { name: "SimpleSearchM", description: "Builds the simple filter expression for a model report.", params: [{ name: "CCReport<M> rpt", description: "The report containing the basic filters." }], returns: "Expression<Func<M, bool>>" },
                    { name: "ApplyDTOFilters", description: "Turns one DTO filter into an expression and adds it to the running result.", params: [{ name: "Expression<Func<DTO, bool>> modelExpression", description: "The current expression being built." }, { name: "bool removeExpressionTrue", description: "Tracks whether the seed expression is still in use." }, { name: "DTO searchObject", description: "The DTO populated from filter values." }, { name: "ParameterExpression parameter", description: "The lambda parameter used for the expression." }, { name: "Expression<Func<DTO, bool>> likeMethodExpSS", description: "The current expression fragment." }, { name: "CCFilter filter", description: "The filter being processed." }, { name: "PropertyInfo property", description: "The property tied to the filter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "string op", description: "How to combine the expression." }], returns: "Expression<Func<DTO, bool>>" },
                    { name: "ApplyFilters", description: "Turns one model filter into an expression and adds it to the running result.", params: [{ name: "Expression<Func<M, bool>> modelExpression", description: "The current expression being built." }, { name: "bool removeExpressionTrue", description: "Tracks whether the seed expression is still in use." }, { name: "M searchObject", description: "The model populated from filter values." }, { name: "ParameterExpression parameter", description: "The lambda parameter used for the expression." }, { name: "Expression<Func<M, bool>> likeMethodExpSS", description: "The current expression fragment." }, { name: "CCFilter filter", description: "The filter being processed." }, { name: "PropertyInfo property", description: "The property tied to the filter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "string op", description: "How to combine the expression." }], returns: "Expression<Func<M, bool>>" },
                    { name: "AdvancedSearchM", description: "Combines quick search, simple filters, and advanced filters for a model report.", params: [{ name: "CCReport<M> rpt", description: "The report containing all search criteria." }], returns: "Expression<Func<M, bool>>" },
                    { name: "TraverseAdvancedFilters", description: "Walks a nested advanced filter and builds one expression from it.", params: [{ name: "CCFilter filter", description: "The filter or filter group to process." }, { name: "CCReport<M> rpt", description: "The report that supplies the filter values." }], returns: "Expression<Func<M, bool>>" },
                    { name: "BuildMExpressionFromFilters", description: "Builds one model filter expression from a list of filters.", params: [{ name: "List<M> searchObject", description: "The working model list used during expression building." }, { name: "List<CCFilter> filters", description: "The filters to process." }], returns: "Expression<Func<M, bool>>" },
                    { name: "Equals", description: "Builds an equals expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "NotEquals", description: "Builds a not-equals expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "GreaterThan", description: "Builds a greater-than expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "LessThan", description: "Builds a less-than expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "GreaterThanOrEqual", description: "Builds a greater-than-or-equal expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "LessThanOrEqual", description: "Builds a less-than-or-equal expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "Contains", description: "Builds a contains expression for string fields.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "NotContains", description: "Builds a not-contains expression for string fields.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "StartsWith", description: "Builds a starts-with expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "NotStartsWith", description: "Builds a not-starts-with expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "EndsWith", description: "Builds an ends-with expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "NotEndsWith", description: "Builds a not-ends-with expression.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" },
                    { name: "In", description: "Builds an in-expression for a string or collection field.", params: [{ name: "ParameterExpression p", description: "The lambda parameter." }, { name: "Expression left", description: "The left side of the comparison." }, { name: "Expression right", description: "The right side of the comparison." }], returns: "Expression<Func<T, bool>>" }
                ],
                notes: [
                    "This file turns report filters into expression trees for LINQ and EF queries.",
                    "It handles quick search, simple search, advanced search, and the reusable comparison operators.",
                    "The private helpers inside the file support range parsing and typed constant creation for the public filters."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "var filter = report.QuickSearchM();",
                    "var expression = report.AdvancedSearchM();"
                ]
            };
        }

        /**
         * Returns structured documentation for the CCReport serialization extension file.
         * @returns {Object} Documentation metadata and description
         */
        static CCReportSerializationExtensions() {
            return {
                class: "CCReportSerializationExtensions",
                type: "Static Class (C# Extension Methods)",
                namespace: "Cats.Infrastructure.Extensions",
                source: "CCReportSerializationExtensions.cs",
                sourceUrl: "/src/Infrastructure/Extensions/CCReportSerializationExtensions.cs",
                description: "Provides the report serialization helpers that turn a report into JSON and save a DTO report to storage.",
                author: "Dominic Roche",
                license: "Public Domain (US Copyright Law, Section 105)",
                lastRefactor: "2026",
                language: "C#",
                methods: [
                    {
                        name: "ReportAsJson",
                        description: "Turns a report into JSON for the client.",
                        params: [
                            { name: "CCReport<M> report", description: "The report to serialize." }
                        ],
                        returns: "string"
                    },
                    {
                        name: "Save",
                        description: "Saves a DTO report and returns the table JSON used by the client.",
                        params: [
                            { name: "CCReportDTO ccReportIn", description: "The report payload to save." },
                            { name: "ModelsEntities db", description: "The database context." },
                            { name: "CatsSessionDTO CSO", description: "The current session data." },
                            { name: "String roleName", description: "The role being saved with the report." },
                            { name: "Expression<Func<M, bool>> starter", description: "The starter expression for the report query." }
                        ],
                        returns: "string"
                    }
                ],
                notes: [
                    "This file handles the last step of the reporting workflow: turning report data into JSON or saving it back to the database.",
                    "It also prepares the table configuration the browser expects after a save completes.",
                    "The save helper depends on the report model exposing the standard GetList and GetAdvancedListM methods."
                ],
                exampleUsage: [
                    "using Cats.Infrastructure.Extensions;",
                    "var json = report.ReportAsJson();",
                    "var tableJson = ccReportDto.Save<HR_Employee>(db, cso, roleName, starter);"
                ]
            };
        }
       



}
