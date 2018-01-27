

'use strict';

( function() {

	var pathBlockLimitElements = {},
		pathBlockElements = {},
		tag;

	// Elements that are considered the "Block limit" in an element path.
	for ( tag in CKEDITOR.dtd.$blockLimit ) {
		// Exclude from list roots.
		if ( !( tag in CKEDITOR.dtd.$list ) )
			pathBlockLimitElements[ tag ] = 1;
	}

	// Elements that are considered the "End level Block" in an element path.
	for ( tag in CKEDITOR.dtd.$block ) {
		// Exclude block limits, and empty block element, e.g. hr.
		if ( !( tag in CKEDITOR.dtd.$blockLimit || tag in CKEDITOR.dtd.$empty ) )
			pathBlockElements[ tag ] = 1;
	}

	// Check if an element contains any block element.
	function checkHasBlock( element ) {
		var childNodes = element.getChildren();

		for ( var i = 0, count = childNodes.count(); i < count; i++ ) {
			var child = childNodes.getItem( i );

			if ( child.type == CKEDITOR.NODE_ELEMENT && CKEDITOR.dtd.$block[ child.getName() ] )
				return true;
		}

		return false;
	}

	
	CKEDITOR.dom.elementPath = function( startNode, root ) {
		var block = null,
			blockLimit = null,
			elements = [],
			e = startNode,
			elementName;

		// Backward compact.
		root = root || startNode.getDocument().getBody();

		do {
			if ( e.type == CKEDITOR.NODE_ELEMENT ) {
				elements.push( e );

				if ( !this.lastElement ) {
					this.lastElement = e;

					// If an object or non-editable element is fully selected at the end of the element path,
					// it must not become the block limit.
					if ( e.is( CKEDITOR.dtd.$object ) || e.getAttribute( 'contenteditable' ) == 'false' )
						continue;
				}

				if ( e.equals( root ) )
					break;

				if ( !blockLimit ) {
					elementName = e.getName();

					// First editable element becomes a block limit, because it cannot be split.
					if ( e.getAttribute( 'contenteditable' ) == 'true' )
						blockLimit = e;
					// "Else" because element cannot be both - block and block levelimit.
					else if ( !block && pathBlockElements[ elementName ] )
						block = e;

					if ( pathBlockLimitElements[ elementName ] ) {
						// End level DIV is considered as the block, if no block is available. (#525)
						// But it must NOT be the root element (checked above).
						if ( !block && elementName == 'div' && !checkHasBlock( e ) )
							block = e;
						else
							blockLimit = e;
					}
				}
			}
		}
		while ( ( e = e.getParent() ) );

		// Block limit defaults to root.
		if ( !blockLimit )
			blockLimit = root;

		
		this.block = block;

		
		this.blockLimit = blockLimit;

		
		this.root = root;

		
		this.elements = elements;

		
	};

} )();

CKEDITOR.dom.elementPath.prototype = {
	
	compare: function( otherPath ) {
		var thisElements = this.elements;
		var otherElements = otherPath && otherPath.elements;

		if ( !otherElements || thisElements.length != otherElements.length )
			return false;

		for ( var i = 0; i < thisElements.length; i++ ) {
			if ( !thisElements[ i ].equals( otherElements[ i ] ) )
				return false;
		}

		return true;
	},

	
	contains: function( query, excludeRoot, fromTop ) {
		var evaluator;
		if ( typeof query == 'string' )
			evaluator = function( node ) {
				return node.getName() == query;
			};
		if ( query instanceof CKEDITOR.dom.element )
			evaluator = function( node ) {
				return node.equals( query );
			};
		else if ( CKEDITOR.tools.isArray( query ) )
			evaluator = function( node ) {
				return CKEDITOR.tools.indexOf( query, node.getName() ) > -1;
			};
		else if ( typeof query == 'function' )
			evaluator = query;
		else if ( typeof query == 'object' )
			evaluator = function( node ) {
				return node.getName() in query;
			};

		var elements = this.elements,
			length = elements.length;
		excludeRoot && length--;

		if ( fromTop ) {
			elements = Array.prototype.slice.call( elements, 0 );
			elements.reverse();
		}

		for ( var i = 0; i < length; i++ ) {
			if ( evaluator( elements[ i ] ) )
				return elements[ i ];
		}

		return null;
	},

	
	isContextFor: function( tag ) {
		var holder;

		// Check for block context.
		if ( tag in CKEDITOR.dtd.$block ) {
			// Indeterminate elements which are not subjected to be splitted or surrounded must be checked first.
			var inter = this.contains( CKEDITOR.dtd.$intermediate );
			holder = inter || ( this.root.equals( this.block ) && this.block ) || this.blockLimit;
			return !!holder.getDtd()[ tag ];
		}

		return true;
	},

	
	direction: function() {
		var directionNode = this.block || this.blockLimit || this.root;
		return directionNode.getDirection( 1 );
	}
};
