

'use strict';


CKEDITOR.htmlParser.element = function( name, attributes ) {
	
	this.name = name;

	
	this.attributes = attributes || {};

	
	this.children = [];

	// Reveal the real semantic of our internal custom tag name (#6639),
	// when resolving whether it's block like.
	var realName = name || '',
		prefixed = realName.match( /^cke:(.*)/ );
	prefixed && ( realName = prefixed[ 1 ] );

	var isBlockLike = !!( CKEDITOR.dtd.$nonBodyContent[ realName ] || CKEDITOR.dtd.$block[ realName ] ||
		CKEDITOR.dtd.$listItem[ realName ] || CKEDITOR.dtd.$tableContent[ realName ] ||
		CKEDITOR.dtd.$nonEditable[ realName ] || realName == 'br' );

	this.isEmpty = !!CKEDITOR.dtd.$empty[ name ];
	this.isUnknown = !CKEDITOR.dtd[ name ];

	
	this._ = {
		isBlockLike: isBlockLike,
		hasInlineStarted: this.isEmpty || !isBlockLike
	};
};


CKEDITOR.htmlParser.cssStyle = function() {
	var styleText,
		arg = arguments[ 0 ],
		rules = {};

	styleText = arg instanceof CKEDITOR.htmlParser.element ? arg.attributes.style : arg;

	// html-encoded quote might be introduced by 'font-family'
	// from MS-Word which confused the following regexp. e.g.
	//'font-family: &quot;Lucida, Console&quot;'
	// TODO reuse CSS methods from tools.
	( styleText || '' ).replace( /&quot;/g, '"' ).replace( /\s*([^ :;]+)\s*:\s*([^;]+)\s*(?=;|$)/g, function( match, name, value ) {
		name == 'font-family' && ( value = value.replace( /["']/g, '' ) );
		rules[ name.toLowerCase() ] = value;
	} );

	return {

		rules: rules,

		
		populate: function( obj ) {
			var style = this.toString();
			if ( style )
				obj instanceof CKEDITOR.dom.element ? obj.setAttribute( 'style', style ) : obj instanceof CKEDITOR.htmlParser.element ? obj.attributes.style = style : obj.style = style;

		},

		
		toString: function() {
			var output = [];
			for ( var i in rules )
				rules[ i ] && output.push( i, ':', rules[ i ], ';' );
			return output.join( '' );
		}
	};
};


( function() {
	// Used to sort attribute entries in an array, where the first element of
	// each object is the attribute name.
	var sortAttribs = function( a, b ) {
			a = a[ 0 ];
			b = b[ 0 ];
			return a < b ? -1 : a > b ? 1 : 0;
		},
		fragProto = CKEDITOR.htmlParser.fragment.prototype;

	CKEDITOR.htmlParser.element.prototype = CKEDITOR.tools.extend( new CKEDITOR.htmlParser.node(), {
		
		type: CKEDITOR.NODE_ELEMENT,

		
		add: fragProto.add,

		
		clone: function() {
			return new CKEDITOR.htmlParser.element( this.name, this.attributes );
		},

		
		filter: function( filter, context ) {
			var element = this,
				originalName, name;

			context = element.getFilterContext( context );

			// Do not process elements with data-cke-processor attribute set to off.
			if ( context.off )
				return true;

			// Filtering if it's the root node.
			if ( !element.parent )
				filter.onRoot( context, element );

			while ( true ) {
				originalName = element.name;

				if ( !( name = filter.onElementName( context, originalName ) ) ) {
					this.remove();
					return false;
				}

				element.name = name;

				if ( !( element = filter.onElement( context, element ) ) ) {
					this.remove();
					return false;
				}

				// New element has been returned - replace current one
				// and process it (stop processing this and return false, what
				// means that element has been removed).
				if ( element !== this ) {
					this.replaceWith( element );
					return false;
				}

				// If name has been changed - continue loop, so in next iteration
				// filters for new name will be applied to this element.
				// If name hasn't been changed - stop.
				if ( element.name == originalName )
					break;

				// If element has been replaced with something of a
				// different type, then make the replacement filter itself.
				if ( element.type != CKEDITOR.NODE_ELEMENT ) {
					this.replaceWith( element );
					return false;
				}

				// This indicate that the element has been dropped by
				// filter but not the children.
				if ( !element.name ) {
					this.replaceWithChildren();
					return false;
				}
			}

			var attributes = element.attributes,
				a, value, newAttrName;

			for ( a in attributes ) {
				newAttrName = a;
				value = attributes[ a ];

				// Loop until name isn't modified.
				// A little bit senseless, but IE would do that anyway
				// because it iterates with for-in loop even over properties
				// created during its run.
				while ( true ) {
					if ( !( newAttrName = filter.onAttributeName( context, a ) ) ) {
						delete attributes[ a ];
						break;
					} else if ( newAttrName != a ) {
						delete attributes[ a ];
						a = newAttrName;
						continue;
					} else {
						break;
					}
				}

				if ( newAttrName ) {
					if ( ( value = filter.onAttribute( context, element, newAttrName, value ) ) === false )
						delete attributes[ newAttrName ];
					else
						attributes[ newAttrName ] = value;
				}
			}

			if ( !element.isEmpty )
				this.filterChildren( filter, false, context );

			return true;
		},

		
		filterChildren: fragProto.filterChildren,

		
		writeHtml: function( writer, filter ) {
			if ( filter )
				this.filter( filter );

			var name = this.name,
				attribsArray = [],
				attributes = this.attributes,
				attrName,
				attr, i, l;

			// Open element tag.
			writer.openTag( name, attributes );

			// Copy all attributes to an array.
			for ( attrName in attributes )
				attribsArray.push( [ attrName, attributes[ attrName ] ] );

			// Sort the attributes by name.
			if ( writer.sortAttributes )
				attribsArray.sort( sortAttribs );

			// Send the attributes.
			for ( i = 0, l = attribsArray.length; i < l; i++ ) {
				attr = attribsArray[ i ];
				writer.attribute( attr[ 0 ], attr[ 1 ] );
			}

			// Close the tag.
			writer.openTagClose( name, this.isEmpty );

			this.writeChildrenHtml( writer );

			// Close the element.
			if ( !this.isEmpty )
				writer.closeTag( name );
		},

		
		writeChildrenHtml: fragProto.writeChildrenHtml,

		
		replaceWithChildren: function() {
			var children = this.children;

			for ( var i = children.length; i; )
				children[ --i ].insertAfter( this );

			this.remove();
		},

		
		forEach: fragProto.forEach,

		
		getFirst: function( condition ) {
			if ( !condition )
				return this.children.length ? this.children[ 0 ] : null;

			if ( typeof condition != 'function' )
				condition = nameCondition( condition );

			for ( var i = 0, l = this.children.length; i < l; ++i ) {
				if ( condition( this.children[ i ] ) )
					return this.children[ i ];
			}
			return null;
		},

		
		getHtml: function() {
			var writer = new CKEDITOR.htmlParser.basicWriter();
			this.writeChildrenHtml( writer );
			return writer.getHtml();
		},

		
		setHtml: function( html ) {
			var children = this.children = CKEDITOR.htmlParser.fragment.fromHtml( html ).children;

			for ( var i = 0, l = children.length; i < l; ++i )
				children[ i ].parent = this;
		},

		
		getOuterHtml: function() {
			var writer = new CKEDITOR.htmlParser.basicWriter();
			this.writeHtml( writer );
			return writer.getHtml();
		},

		
		split: function( index ) {
			var cloneChildren = this.children.splice( index, this.children.length - index ),
				clone = this.clone();

			for ( var i = 0; i < cloneChildren.length; ++i )
				cloneChildren[ i ].parent = clone;

			clone.children = cloneChildren;

			if ( cloneChildren[ 0 ] )
				cloneChildren[ 0 ].previous = null;

			if ( index > 0 )
				this.children[ index - 1 ].next = null;

			this.parent.add( clone, this.getIndex() + 1 );

			return clone;
		},

		
		addClass: function( className ) {
			if ( this.hasClass( className ) )
				return;

			var c = this.attributes[ 'class' ] || '';

			this.attributes[ 'class' ] = c + ( c ? ' ' : '' ) + className;
		},

		
		removeClass: function( className ) {
			var classes = this.attributes[ 'class' ];

			if ( !classes )
				return;

			// We can safely assume that className won't break regexp.
			// http://stackoverflow.com/questions/448981/what-characters-are-valid-in-css-class-names
			classes = CKEDITOR.tools.trim( classes.replace( new RegExp( '(?:\\s+|^)' + className + '(?:\\s+|$)' ), ' ' ) );

			if ( classes )
				this.attributes[ 'class' ] = classes;
			else
				delete this.attributes[ 'class' ];
		},

		
		hasClass: function( className ) {
			var classes = this.attributes[ 'class' ];

			if ( !classes )
				return false;

			return ( new RegExp( '(?:^|\\s)' + className + '(?=\\s|$)' ) ).test( classes );
		},

		getFilterContext: function( ctx ) {
			var changes = [];

			if ( !ctx ) {
				ctx = {
					off: false,
					nonEditable: false,
					nestedEditable: false
				};
			}

			if ( !ctx.off && this.attributes[ 'data-cke-processor' ] == 'off' )
				changes.push( 'off', true );

			if ( !ctx.nonEditable && this.attributes.contenteditable == 'false' )
				changes.push( 'nonEditable', true );
			// A context to be given nestedEditable must be nonEditable first (by inheritance) (#11372, #11698).
			// Special case: #11504 - filter starts on <body contenteditable=true>,
			// so ctx.nonEditable has not been yet set to true.
			else if ( ctx.nonEditable && !ctx.nestedEditable && this.attributes.contenteditable == 'true' )
				changes.push( 'nestedEditable', true );

			if ( changes.length ) {
				ctx = CKEDITOR.tools.copy( ctx );
				for ( var i = 0; i < changes.length; i += 2 )
					ctx[ changes[ i ] ] = changes[ i + 1 ];
			}

			return ctx;
		}
	}, true );

	function nameCondition( condition ) {
		return function( el ) {
			return el.type == CKEDITOR.NODE_ELEMENT &&
				( typeof condition == 'string' ? el.name == condition : el.name in condition );
		};
	}
} )();
