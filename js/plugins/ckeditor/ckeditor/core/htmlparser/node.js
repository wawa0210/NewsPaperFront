

'use strict';

( function() {
	
	CKEDITOR.htmlParser.node = function() {};

	CKEDITOR.htmlParser.node.prototype = {
		
		remove: function() {
			var children = this.parent.children,
				index = CKEDITOR.tools.indexOf( children, this ),
				previous = this.previous,
				next = this.next;

			previous && ( previous.next = next );
			next && ( next.previous = previous );
			children.splice( index, 1 );
			this.parent = null;
		},

		
		replaceWith: function( node ) {
			var children = this.parent.children,
				index = CKEDITOR.tools.indexOf( children, this ),
				previous = node.previous = this.previous,
				next = node.next = this.next;

			previous && ( previous.next = node );
			next && ( next.previous = node );

			children[ index ] = node;

			node.parent = this.parent;
			this.parent = null;
		},

		
		insertAfter: function( node ) {
			var children = node.parent.children,
				index = CKEDITOR.tools.indexOf( children, node ),
				next = node.next;

			children.splice( index + 1, 0, this );

			this.next = node.next;
			this.previous = node;
			node.next = this;
			next && ( next.previous = this );

			this.parent = node.parent;
		},

		
		insertBefore: function( node ) {
			var children = node.parent.children,
				index = CKEDITOR.tools.indexOf( children, node );

			children.splice( index, 0, this );

			this.next = node;
			this.previous = node.previous;
			node.previous && ( node.previous.next = this );
			node.previous = this;

			this.parent = node.parent;
		},

		
		getAscendant: function( condition ) {
			var checkFn =
				typeof condition == 'function' ?
					condition :
				typeof condition == 'string' ?
					function( el ) {
						return el.name == condition;
					} :
					function( el ) {
						return el.name in condition;
					};

			var parent = this.parent;

			// Parent has to be an element - don't check doc fragment.
			while ( parent && parent.type == CKEDITOR.NODE_ELEMENT ) {
				if ( checkFn( parent ) )
					return parent;
				parent = parent.parent;
			}

			return null;
		},

		
		wrapWith: function( wrapper ) {
			this.replaceWith( wrapper );
			wrapper.add( this );
			return wrapper;
		},

		
		getIndex: function() {
			return CKEDITOR.tools.indexOf( this.parent.children, this );
		},

		getFilterContext: function( context ) {
			return context || {};
		}
	};
} )();
